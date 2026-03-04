import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AggDelta,
  AppError,
  ScanConfidence,
  ScanDiagnostics,
  ScanEngine,
  ScanMode,
  ScanPauseResponse,
  ScanProgress,
  ScanProgressBatch,
  ScanQuickReady,
  ScanResumeResponse,
  ScanStartRequest,
  ScanStartResponse,
} from "../../types/contracts";
import {
  createPathPolicyClassifier,
  evaluateRootPath,
  type PathPolicyClassifier,
} from "../core/securityPolicy";
import { makeAppError } from "../utils/appError";
import {
  createMacOSIncrementalWatcher,
  type IncrementalWatcherHandle,
} from "./accelerators/macosIncrementalWatcher";
import { buildMacOSQuickQueue } from "./accelerators/macosQuickScanner";
import {
  buildQuickReadyPayload,
  buildScanDiagnostics,
  inferQuickConfidence,
} from "./diagnostics/scanDiagnostics";
import { ScanAggregator } from "./scanAggregator";
import {
  detectCpuHintFromPlatform,
  startNativeScannerSession,
  type NativeScanPhaseMode,
  type NativeScannerSession,
} from "./native/nativeRustScannerClient";

const EMIT_INTERVAL_MS = 250;
const DELTA_BATCH_LIMIT = 1024;
const BASE_STAT_CONCURRENCY = 64;
const PREVIEW_ROOT_STAT_CONCURRENCY = 128;
const TOP_LIMIT_PER_DIRECTORY = 200;
const MAX_RECOVERABLE_ERRORS = 100;
const ENTRY_YIELD_INTERVAL = 1024;
const DEEP_PRIORITY_SAMPLE_SIZE = 64;
const QUICK_PASS_DEPTH = 2;
const QUICK_PASS_TIME_BUDGET_MS = 5000;
const ROOT_QUICK_PASS_DEPTH = 1;
const ROOT_QUICK_PASS_TIME_BUDGET_MS = 3000;
const DEFAULT_NON_ROOT_QUICK_BUDGET_MS = 3000;
const DIAGNOSTICS_INTERVAL_MS = 700;
const DEEP_START_GRACE_MS = 500;
const INCREMENTAL_IDLE_GRACE_MS = 1000;
const PREVIEW_DEEP_BUDGET_ROOT_MS = 5_000;
const FAST_DIRECTORY_ESTIMATE_TIMEOUT_MS = 1_500;
const HEAVY_BACKGROUND_ESTIMATE_TIMEOUT_MS = 4_000;
const HEAVY_FALLBACK_ESTIMATE_BYTES = 32 * 1024 * 1024;
const HEAVY_DIRECTORY_SCORE_PENALTY = 10_000_000_000_000;
const NATIVE_DEEP_MAX_DEPTH = 128;
const NATIVE_QUICK_ROOT_MAX_DEPTH = 2;
const NATIVE_QUICK_DEFAULT_MAX_DEPTH = 3;
const HEAVY_DIRECTORY_BASENAMES = new Set([
  "node_modules",
  ".pnpm",
  ".yarn",
  ".cache",
  ".npm",
  ".pnpm-store",
  ".turbo",
  ".nx",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "__pycache__",
  ".venv",
  "venv",
  ".gradle",
  ".m2",
  ".cargo",
  ".terraform",
  "vendor",
  "deps",
  "third_party",
  "build",
  "dist",
  "out",
  "target",
  ".git",
  "DerivedData",
  "Caches",
  "Volumes",
  ".Spotlight-V100",
  ".fseventsd",
  "Trash",
  ".Trash",
]);

type ScanStage = Exclude<ScanProgress["scanStage"], undefined>;

interface QuickPassConfig {
  depthLimit: number;
  timeBudgetMs: number;
}

interface ResolvedScanOptions {
  performanceProfile: NonNullable<ScanStartRequest["performanceProfile"]>;
  scanMode: ScanMode;
  quickBudgetMs: number;
  statConcurrency: number;
}

interface QueueItem {
  dirPath: string;
  depth: number;
}

interface ScanJob {
  scanId: string;
  rootPath: string;
  startedAt: number;
  optInProtected: boolean;
  cancelled: boolean;
  paused: boolean;
  completed: boolean;
  scannedCount: number;
  totalBytes: number;
  currentPath: string;
  lastEmitAt: number;
  pendingDeltaMap: Map<string, AggDelta>;
  pendingDeltaEventCount: number;
  emittedErrorCount: number;
  permissionErrorCount: number;
  ioErrorCount: number;
  quickReadyEmitted: boolean;
  estimatedResult: boolean;
  diagnosticsLastEmitAt: number;
  estimatedDirectories: Set<string>;
  skippedHeavyDirectories: Set<string>;
  options: ResolvedScanOptions;
  engine: ScanEngine;
  fallbackReason?: string;
  aggregator: ScanAggregator;
  pathClassifier: PathPolicyClassifier;
  scanStage: ScanStage;
}

export class DiskScanService {
  private readonly jobs = new Map<string, ScanJob>();
  private readonly nativeSessions = new Map<string, NativeScannerSession>();
  private readonly progressListeners = new Set<(batch: ScanProgressBatch) => void>();
  private readonly quickReadyListeners = new Set<(event: ScanQuickReady) => void>();
  private readonly diagnosticsListeners = new Set<(event: ScanDiagnostics) => void>();
  private readonly errorListeners = new Set<(error: AppError) => void>();

  onProgress(listener: (batch: ScanProgressBatch) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  onError(listener: (error: AppError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onQuickReady(listener: (event: ScanQuickReady) => void): () => void {
    this.quickReadyListeners.add(listener);
    return () => this.quickReadyListeners.delete(listener);
  }

  onDiagnostics(listener: (event: ScanDiagnostics) => void): () => void {
    this.diagnosticsListeners.add(listener);
    return () => this.diagnosticsListeners.delete(listener);
  }

  async startScan(input: ScanStartRequest): Promise<ScanStartResponse> {
    const rootDecision = await evaluateRootPath(input.rootPath, input.optInProtected);
    if (!rootDecision.allowed && rootDecision.error) {
      throw rootDecision.error;
    }

    await this.assertPathReadable(rootDecision.normalizedPath);

    const scanId = crypto.randomUUID();
    const startedAt = Date.now();

    const options = resolveScanOptions(input, rootDecision.normalizedPath);

    const job: ScanJob = {
      scanId,
      rootPath: rootDecision.normalizedPath,
      startedAt,
      optInProtected: input.optInProtected,
      cancelled: false,
      paused: false,
      completed: false,
      scannedCount: 0,
      totalBytes: 0,
      currentPath: rootDecision.normalizedPath,
      lastEmitAt: Date.now(),
      pendingDeltaMap: new Map<string, AggDelta>(),
      pendingDeltaEventCount: 0,
      emittedErrorCount: 0,
      permissionErrorCount: 0,
      ioErrorCount: 0,
      quickReadyEmitted: false,
      estimatedResult: true,
      diagnosticsLastEmitAt: startedAt,
      estimatedDirectories: new Set<string>(),
      skippedHeavyDirectories: new Set<string>(),
      options,
      engine: options.scanMode === "native_rust" ? "native" : "node",
      aggregator: new ScanAggregator(
        rootDecision.normalizedPath,
        TOP_LIMIT_PER_DIRECTORY,
        os.platform(),
      ),
      pathClassifier: createPathPolicyClassifier(),
      scanStage: "quick",
    };

    this.jobs.set(scanId, job);

    void this.runScan(job).finally(() => {
      this.jobs.delete(scanId);
    });

    return { scanId, startedAt };
  }

  pauseScan(scanId: string): ScanPauseResponse {
    const job = this.jobs.get(scanId);
    if (!job || job.completed || job.cancelled) {
      return { ok: false };
    }

    job.paused = true;
    this.nativeSessions.get(scanId)?.sendControl("pause");
    this.emitProgressBatch(job, "paused", true);
    return { ok: true };
  }

  resumeScan(scanId: string): ScanResumeResponse {
    const job = this.jobs.get(scanId);
    if (!job || job.completed || job.cancelled) {
      return { ok: false };
    }

    job.paused = false;
    this.nativeSessions.get(scanId)?.sendControl("resume");
    this.emitProgressBatch(job, "walking", true);
    return { ok: true };
  }

  cancelScan(scanId: string): boolean {
    const job = this.jobs.get(scanId);
    if (!job || job.completed) {
      return false;
    }

    job.cancelled = true;
    this.nativeSessions.get(scanId)?.sendControl("cancel");
    return true;
  }

  emitError(error: AppError): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  private async runScan(job: ScanJob): Promise<void> {
    if (job.options.scanMode === "native_rust") {
      try {
        await this.runNativeScan(job);
        return;
      } catch (error) {
        const nativeFailure = makeAppError(
          "E_NATIVE_FAILURE",
          "Native scanner failed, falling back to portable scanner",
          true,
          {
            scanId: job.scanId,
            rootPath: job.rootPath,
            raw: String(error),
          },
        );
        this.emitRecoverableError(job, nativeFailure);
        job.engine = "node";
        job.fallbackReason = nativeFailure.message;
        job.options.scanMode = process.platform === "darwin"
          ? "portable_plus_os_accel"
          : "portable";
      }
    }

    await this.runPortableScan(job);
  }

  private async runPortableScan(job: ScanJob): Promise<void> {
    const quickConfig = resolveQuickPassConfig(job.rootPath, os.platform(), job.options);
    const quickQueue = await this.createInitialQuickQueue(job, quickConfig.depthLimit);
    const deepQueue: string[] = [];
    const deepQueued = new Set<string>();
    const quickProcessed = new Set<string>();
    const quickStartedAt = Date.now();

    const enqueueDeep = (dirPath: string): void => {
      enqueueUniquePath(deepQueue, deepQueued, dirPath);
    };

    job.scanStage = "quick";

    while (quickQueue.length > 0 && !job.cancelled) {
      await this.waitWhilePaused(job);
      if (job.cancelled) {
        break;
      }

      const budgetElapsed = Date.now() - quickStartedAt >= quickConfig.timeBudgetMs;
      if (budgetElapsed && quickProcessed.size > 0) {
        break;
      }

      const current = quickQueue.shift();
      if (!current) {
        break;
      }

      job.currentPath = current.dirPath;
      if (!this.classifyPathOrEmit(job, current.dirPath)) {
        continue;
      }

      try {
        quickProcessed.add(current.dirPath);
        await this.processDirectory(
          job,
          current,
          quickQueue,
          enqueueDeep,
          quickConfig.depthLimit,
        );
      } catch (error) {
        this.emitRecoverableError(
          job,
          toFilesystemError(error, current.dirPath, "Failed to process directory"),
        );
      }

      this.emitProgressBatch(job, "walking", false);
      this.emitDiagnostics(job, "walking", quickQueue.length + deepQueue.length, false);
    }

    for (const queued of quickQueue) {
      enqueueDeep(queued.dirPath);
    }

    this.emitQuickReady(job, quickStartedAt);
    await sleep(DEEP_START_GRACE_MS);

    job.scanStage = "deep";
    this.emitProgressBatch(job, "walking", true);
    this.emitDiagnostics(job, "walking", deepQueue.length, true);

    let lastIncrementalChangeAt = 0;
    const deepStartedAt = Date.now();
    let deepBudgetExceeded = false;
    const watcher: IncrementalWatcherHandle | null = createMacOSIncrementalWatcher(
      job.rootPath,
      job.options.scanMode,
      (change) => {
        const targetDir = normalizeIncrementalTarget(change.changedPath);
        if (!targetDir) {
          return;
        }
        enqueueDeep(targetDir);
        lastIncrementalChangeAt = change.at;
      },
    );

    while (!job.cancelled) {
      await this.waitWhilePaused(job);
      if (job.cancelled) {
        break;
      }

      if (
        shouldStopDeepPassForPreview(
          job.options.performanceProfile,
          job.rootPath,
          os.platform(),
          Date.now() - deepStartedAt,
        )
      ) {
        deepBudgetExceeded = true;
        break;
      }

      if (deepQueue.length === 0) {
        const tasks = this.activeStatTasks.get(job);
        const hasPendingStats = Boolean(tasks && tasks.size > 0);
        const incrementalActive =
          watcher !== null &&
          Date.now() - lastIncrementalChangeAt <= INCREMENTAL_IDLE_GRACE_MS;

        if (!hasPendingStats && !incrementalActive) {
          break;
        }

        if (hasPendingStats) {
          await Promise.race(tasks ?? []);
          continue;
        }

        await sleep(60);
        continue;
      }

      const nextDir = popPriorityDirectory(
        deepQueue,
        DEEP_PRIORITY_SAMPLE_SIZE,
        (candidate) => this.scoreDeepCandidate(job, candidate),
      );
      if (!nextDir) {
        break;
      }

      deepQueued.delete(nextDir);

      if (quickProcessed.has(nextDir)) {
        continue;
      }

      job.currentPath = nextDir;
      if (!this.classifyPathOrEmit(job, nextDir)) {
        continue;
      }

      try {
        await this.processDirectory(job, { dirPath: nextDir, depth: 0 }, null, enqueueDeep, 0);
      } catch (error) {
        this.emitRecoverableError(
          job,
          toFilesystemError(error, nextDir, "Failed to process directory"),
        );
      }

      this.emitProgressBatch(job, "walking", false);
      this.emitDiagnostics(job, "walking", deepQueue.length, false);
    }

    watcher?.close();

    if (!job.cancelled && !deepBudgetExceeded) {
      job.estimatedResult = false;
    }

    await this.flushStatTasks(job);

    if (job.cancelled) {
      this.emitRecoverableError(
        job,
        makeAppError("E_CANCELLED", "Scan was cancelled by user", true, {
          scanId: job.scanId,
        }),
      );
    }

    this.emitProgressBatch(job, "aggregating", true);
    this.emitDiagnostics(job, "aggregating", deepQueue.length, true);
    this.emitProgressBatch(job, "compressing", true);
    this.emitDiagnostics(job, "compressing", deepQueue.length, true);
    this.emitProgressBatch(job, "finalizing", true);
    this.emitDiagnostics(job, "finalizing", 0, true);

    job.completed = true;
  }

  private async runNativeScan(job: ScanJob): Promise<void> {
    job.engine = "native";
    job.scanStage = "quick";

    const quickStartedAt = Date.now();
    const quickMaxDepth = isFilesystemRoot(job.rootPath, os.platform())
      ? NATIVE_QUICK_ROOT_MAX_DEPTH
      : NATIVE_QUICK_DEFAULT_MAX_DEPTH;

    await this.runNativeStage(job, {
      mode: "quick",
      stageStartedAt: quickStartedAt,
      maxDepth: quickMaxDepth,
      timeBudgetMs: Math.max(500, job.options.quickBudgetMs),
    });

    if (!job.quickReadyEmitted) {
      this.emitQuickReady(job, quickStartedAt);
    }

    if (!job.cancelled) {
      await sleep(DEEP_START_GRACE_MS);
    }

    if (!job.cancelled) {
      job.scanStage = "deep";
      this.emitProgressBatch(job, "walking", true);
      this.emitDiagnostics(job, "walking", 0, true);

      const deepBudgetMs =
        shouldStopDeepPassForPreview(
          job.options.performanceProfile,
          job.rootPath,
          os.platform(),
          0,
        )
          ? PREVIEW_DEEP_BUDGET_ROOT_MS
          : 0;

      const deepResult = await this.runNativeStage(job, {
        mode: "deep",
        stageStartedAt: Date.now(),
        maxDepth: NATIVE_DEEP_MAX_DEPTH,
        timeBudgetMs: deepBudgetMs,
      });

      if (!job.cancelled) {
        job.estimatedResult = deepResult.estimated;
      }
    }

    if (job.cancelled) {
      this.emitRecoverableError(
        job,
        makeAppError("E_CANCELLED", "Scan was cancelled by user", true, {
          scanId: job.scanId,
        }),
      );
    }

    this.emitProgressBatch(job, "aggregating", true);
    this.emitDiagnostics(job, "aggregating", 0, true);
    this.emitProgressBatch(job, "compressing", true);
    this.emitDiagnostics(job, "compressing", 0, true);
    this.emitProgressBatch(job, "finalizing", true);
    this.emitDiagnostics(job, "finalizing", 0, true);
    job.completed = true;
  }

  private async runNativeStage(
    job: ScanJob,
    input: {
      mode: NativeScanPhaseMode;
      stageStartedAt: number;
      maxDepth: number;
      timeBudgetMs: number;
    },
  ): Promise<{ estimated: boolean }> {
    let doneEstimated = input.mode === "quick";
    let queueDepth = 0;
    let doneReceived = false;

    const session = startNativeScannerSession(
      {
        scanId: job.scanId,
        root: job.rootPath,
        mode: input.mode,
        platform: os.platform(),
        timeBudgetMs: input.timeBudgetMs,
        maxDepth: input.maxDepth,
        sameDeviceOnly: true,
        concurrency: job.options.statConcurrency,
        skipBasenames: [...HEAVY_DIRECTORY_BASENAMES],
      },
      {
        onMessage: (message) => {
          switch (message.type) {
            case "agg": {
              if (message.countDelta > 0) {
                job.totalBytes += message.sizeDelta;
                const deltas = job.aggregator.addFile(message.path, message.sizeDelta);
                this.appendDeltas(job, deltas);
              } else if (message.sizeDelta > 0) {
                const deltas = job.aggregator.addDirectoryEstimate(
                  message.path,
                  message.sizeDelta,
                );
                this.appendDeltas(job, deltas);
                job.estimatedDirectories.add(message.path);
              }
              return;
            }
            case "progress":
              job.scannedCount = Math.max(job.scannedCount, message.scannedCount);
              queueDepth = message.queuedDirs;
              if (message.currentPath) {
                job.currentPath = message.currentPath;
              }
              this.emitProgressBatch(job, "walking", false);
              this.emitDiagnostics(job, "walking", queueDepth, false);
              return;
            case "quick_ready":
              this.emitQuickReadyFromNative(job, message, input.stageStartedAt);
              return;
            case "warn":
              this.emitRecoverableError(job, toNativeScannerError(job.scanId, message));
              return;
            case "done":
              doneReceived = true;
              doneEstimated = message.estimated;
              this.emitProgressBatch(job, "walking", true);
              this.emitDiagnostics(job, "walking", queueDepth, true);
              return;
            default:
              return;
          }
        },
      },
    );

    this.nativeSessions.set(job.scanId, session);
    if (job.paused) {
      session.sendControl("pause");
    }
    if (job.cancelled) {
      session.sendControl("cancel");
    }

    try {
      await session.waitForExit();
    } finally {
      if (this.nativeSessions.get(job.scanId) === session) {
        this.nativeSessions.delete(job.scanId);
      }
      session.dispose();
    }

    if (!doneReceived && !job.cancelled) {
      throw new Error(`Native stage ${input.mode} finished without done event`);
    }

    return { estimated: doneEstimated };
  }

  private emitQuickReadyFromNative(
    job: ScanJob,
    event: { elapsedMs: number; confidence: ScanConfidence; estimated: boolean },
    stageStartedAt: number,
  ): void {
    if (job.quickReadyEmitted) {
      return;
    }

    const quickReadyAt = stageStartedAt + event.elapsedMs;
    job.quickReadyEmitted = true;
    const payload = buildQuickReadyPayload({
      scanId: job.scanId,
      rootPath: job.rootPath,
      quickReadyAt,
      elapsedMs: event.elapsedMs,
      confidence: event.confidence,
      estimated: event.estimated,
    });

    for (const listener of this.quickReadyListeners) {
      listener(payload);
    }
  }

  private async processDirectory(
    job: ScanJob,
    current: QueueItem,
    quickQueue: QueueItem[] | null,
    enqueueDeep: (dirPath: string) => void,
    quickDepthLimit: number,
  ): Promise<void> {
    const dir = await fs.opendir(current.dirPath, { bufferSize: 256 });
    let entryCounter = 0;

    for await (const entry of dir) {
      if (job.cancelled) {
        break;
      }

      await this.waitWhilePaused(job);
      if (job.cancelled) {
        break;
      }

      const fullPath = path.join(current.dirPath, entry.name);
      job.currentPath = fullPath;
      job.scannedCount += 1;
      entryCounter += 1;
      if (entryCounter % ENTRY_YIELD_INTERVAL === 0) {
        await sleep(0);
      }

      if (!this.classifyPathOrEmit(job, fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        this.ensureDirectoryInAggregation(job, fullPath, current.dirPath);

        if (this.shouldSkipHeavyTraversal(job, fullPath)) {
          this.scheduleHeavyDirectoryEstimate(job, fullPath);
          continue;
        }

        if (
          quickQueue === null &&
          this.shouldEstimateDirectory(job, fullPath) &&
          !job.cancelled
        ) {
          const estimatedSize = await estimateDirectorySizeFast(
            fullPath,
            job.options.scanMode,
          );
          if (estimatedSize !== null && estimatedSize > 0) {
            const estimateDeltas = job.aggregator.addDirectoryEstimate(
              fullPath,
              estimatedSize,
            );
            this.appendDeltas(job, estimateDeltas);
            job.estimatedDirectories.add(fullPath);
            continue;
          }
        }

        enqueueDeep(fullPath);
        if (quickQueue && current.depth < quickDepthLimit) {
          quickQueue.push({ dirPath: fullPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      await this.scheduleStatTask(job, async () => {
        if (job.cancelled) {
          return;
        }

        try {
          const stat = await fs.stat(fullPath);
          if (job.cancelled) {
            return;
          }

          job.totalBytes += stat.size;

          const deltas = job.aggregator.addFile(fullPath, stat.size);
          this.appendDeltas(job, deltas);
        } catch (error) {
          this.emitRecoverableError(
            job,
            toFilesystemError(error, fullPath, "Failed to stat file"),
          );
        }

        this.emitProgressBatch(job, "walking", false);
      });
    }
  }

  private ensureDirectoryInAggregation(
    job: ScanJob,
    dirPath: string,
    parentPath: string,
  ): void {
    job.aggregator.ensureDirectory(dirPath, parentPath);
  }

  private classifyPathOrEmit(job: ScanJob, targetPath: string): boolean {
    const decision = job.pathClassifier(targetPath, job.optInProtected, {
      isResolved: true,
    });

    if (decision.allowed) {
      return true;
    }

    if (decision.error) {
      this.emitRecoverableError(job, decision.error);
    }

    return false;
  }

  private emitRecoverableError(job: ScanJob, error: AppError): void {
    if (job.emittedErrorCount >= MAX_RECOVERABLE_ERRORS) {
      return;
    }

    job.emittedErrorCount += 1;
    if (error.code === "E_PERMISSION") {
      job.permissionErrorCount += 1;
    } else if (error.code === "E_IO") {
      job.ioErrorCount += 1;
    }
    this.emitError(error);
  }

  private emitProgressBatch(
    job: ScanJob,
    phase: ScanProgress["phase"],
    force: boolean,
  ): void {
    const now = Date.now();
    const hasEnoughDeltas = job.pendingDeltaEventCount >= DELTA_BATCH_LIMIT;
    const timeElapsed = now - job.lastEmitAt >= EMIT_INTERVAL_MS;

    if (!force && !hasEnoughDeltas && !timeElapsed) {
      return;
    }

    const patch = job.aggregator.consumePatch();

    if (!force && job.pendingDeltaMap.size === 0 && !patch) {
      return;
    }

    const deltas = [...job.pendingDeltaMap.values()];

    const batch: ScanProgressBatch = {
      progress: {
        scanId: job.scanId,
        phase,
        scanStage:
          phase === "walking" || phase === "paused" ? job.scanStage : undefined,
        quickReady: job.quickReadyEmitted,
        confidence: this.resolveConfidence(job),
        estimated: job.estimatedResult,
        scannedCount: job.scannedCount,
        totalBytes: job.totalBytes,
        currentPath: job.currentPath,
      },
      deltas,
      patches: patch ? [patch] : [],
    };

    job.pendingDeltaMap.clear();
    job.pendingDeltaEventCount = 0;
    job.lastEmitAt = now;

    for (const listener of this.progressListeners) {
      listener(batch);
    }
  }

  private appendDeltas(job: ScanJob, deltas: AggDelta[]): void {
    for (const delta of deltas) {
      job.pendingDeltaEventCount += 1;
      const previous = job.pendingDeltaMap.get(delta.nodePath);
      if (previous) {
        previous.sizeDelta += delta.sizeDelta;
        previous.countDelta += delta.countDelta;
        continue;
      }

      job.pendingDeltaMap.set(delta.nodePath, {
        nodePath: delta.nodePath,
        sizeDelta: delta.sizeDelta,
        countDelta: delta.countDelta,
      });
    }
  }

  private readonly activeStatTasks = new WeakMap<ScanJob, Set<Promise<void>>>();

  private async scheduleStatTask(
    job: ScanJob,
    task: () => Promise<void>,
  ): Promise<void> {
    const tasks = this.activeStatTasks.get(job) ?? new Set<Promise<void>>();
    this.activeStatTasks.set(job, tasks);

    while (tasks.size >= job.options.statConcurrency && !job.cancelled) {
      await Promise.race(tasks);
      await this.waitWhilePaused(job);
    }

    const running = task()
      .catch(() => undefined)
      .finally(() => {
        tasks.delete(running);
      });

    tasks.add(running);
  }

  private async flushStatTasks(job: ScanJob): Promise<void> {
    const tasks = this.activeStatTasks.get(job);
    if (!tasks || tasks.size === 0) {
      return;
    }

    await Promise.allSettled(tasks);
    tasks.clear();
  }

  private async waitWhilePaused(job: ScanJob): Promise<void> {
    while (job.paused && !job.cancelled) {
      this.emitProgressBatch(job, "paused", false);
      await sleep(80);
    }
  }

  private async assertPathReadable(rootPath: string): Promise<void> {
    try {
      await fs.access(rootPath);
    } catch {
      throw makeAppError("E_IO", "Root path is not readable", true, {
        rootPath,
      });
    }
  }

  private async createInitialQuickQueue(
    job: ScanJob,
    depthLimit: number,
  ): Promise<QueueItem[]> {
    if (depthLimit <= 0) {
      return [{ dirPath: job.rootPath, depth: 0 }];
    }

    const macQueue = await buildMacOSQuickQueue(job.rootPath, job.options.scanMode).catch(
      () => null,
    );
    if (!macQueue || macQueue.length === 0) {
      return [{ dirPath: job.rootPath, depth: 0 }];
    }

    return macQueue.map((dirPath) => ({ dirPath, depth: 0 }));
  }

  private emitQuickReady(job: ScanJob, quickStartedAt: number): void {
    if (job.quickReadyEmitted) {
      return;
    }

    const now = Date.now();
    job.quickReadyEmitted = true;

    const event = buildQuickReadyPayload({
      scanId: job.scanId,
      rootPath: job.rootPath,
      quickReadyAt: now,
      elapsedMs: now - quickStartedAt,
      confidence: this.resolveConfidence(job),
      estimated: true,
    });

    for (const listener of this.quickReadyListeners) {
      listener(event);
    }
  }

  private emitDiagnostics(
    job: ScanJob,
    phase: ScanProgress["phase"],
    queueDepth: number,
    force: boolean,
  ): void {
    const now = Date.now();
    if (!force && now - job.diagnosticsLastEmitAt < DIAGNOSTICS_INTERVAL_MS) {
      return;
    }

    const progress: ScanProgress = {
      scanId: job.scanId,
      phase,
      scanStage: phase === "walking" || phase === "paused" ? job.scanStage : undefined,
      quickReady: job.quickReadyEmitted,
      confidence: this.resolveConfidence(job),
      estimated: job.estimatedResult,
      scannedCount: job.scannedCount,
      totalBytes: job.totalBytes,
      currentPath: job.currentPath,
    };

    const diagnostics = buildScanDiagnostics(
      progress,
      now - job.startedAt,
      queueDepth,
      {
        recoverableErrors: job.emittedErrorCount,
        permissionErrors: job.permissionErrorCount,
        ioErrors: job.ioErrorCount,
        estimatedDirectories: job.estimatedDirectories.size,
        engine: job.engine,
        fallbackReason: job.fallbackReason,
        cpuHint: job.engine === "native" ? detectCpuHintFromPlatform() : undefined,
      },
    );

    job.diagnosticsLastEmitAt = now;
    for (const listener of this.diagnosticsListeners) {
      listener(diagnostics);
    }
  }

  private resolveConfidence(job: ScanJob): ScanConfidence {
    return inferQuickConfidence({
      rootPath: job.rootPath,
      scannedCount: job.scannedCount,
      permissionErrors: job.permissionErrorCount,
      ioErrors: job.ioErrorCount,
    });
  }

  private shouldEstimateDirectory(job: ScanJob, dirPath: string): boolean {
    if (job.options.performanceProfile === "accuracy-first") {
      return false;
    }

    if (!isHeavyTraversalDirectory(dirPath)) {
      return false;
    }

    if (job.estimatedDirectories.has(dirPath)) {
      return false;
    }

    return job.options.scanMode === "portable_plus_os_accel";
  }

  private shouldSkipHeavyTraversal(job: ScanJob, dirPath: string): boolean {
    if (job.options.performanceProfile !== "preview-first") {
      return false;
    }

    if (!isFilesystemRoot(job.rootPath, os.platform())) {
      return false;
    }

    if (!isHeavyTraversalDirectory(dirPath)) {
      return false;
    }

    if (job.options.scanMode !== "portable_plus_os_accel") {
      return false;
    }

    return !job.skippedHeavyDirectories.has(dirPath);
  }

  private scheduleHeavyDirectoryEstimate(job: ScanJob, dirPath: string): void {
    if (job.skippedHeavyDirectories.has(dirPath)) {
      return;
    }

    job.skippedHeavyDirectories.add(dirPath);

    void this.scheduleStatTask(job, async () => {
      if (job.cancelled) {
        return;
      }

      const estimatedSize =
        (await estimateDirectorySizeFast(
          dirPath,
          job.options.scanMode,
          HEAVY_BACKGROUND_ESTIMATE_TIMEOUT_MS,
        )) ?? HEAVY_FALLBACK_ESTIMATE_BYTES;

      const deltas = job.aggregator.addDirectoryEstimate(dirPath, estimatedSize);
      this.appendDeltas(job, deltas);
      job.estimatedDirectories.add(dirPath);
      this.emitProgressBatch(job, "walking", false);
    });
  }

  private scoreDeepCandidate(job: ScanJob, candidate: string): number {
    let score = job.aggregator.getDirectorySize(candidate);
    if (
      job.options.performanceProfile !== "accuracy-first" &&
      isHeavyTraversalDirectory(candidate)
    ) {
      score -= HEAVY_DIRECTORY_SCORE_PENALTY;
    }

    return score;
  }
}

function toFilesystemError(
  error: unknown,
  targetPath: string,
  defaultMessage: string,
): AppError {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as NodeJS.ErrnoException).code)
      : "UNKNOWN";

  if (code === "EACCES" || code === "EPERM") {
    return makeAppError("E_PERMISSION", defaultMessage, true, {
      targetPath,
      code,
    });
  }

  if (code === "ENOENT" || code === "ENOTDIR") {
    return makeAppError("E_IO", "Path disappeared during scan", true, {
      targetPath,
      code,
    });
  }

  return makeAppError("E_IO", defaultMessage, true, {
    targetPath,
    code,
    raw: String(error),
  });
}

function toNativeScannerError(
  scanId: string,
  message: {
    code: string;
    message: string;
    path?: string;
    recoverable?: boolean;
  },
): AppError {
  if (message.code === "E_PERMISSION") {
    return makeAppError("E_PERMISSION", message.message, message.recoverable ?? true, {
      scanId,
      targetPath: message.path,
      source: "native-scanner",
    });
  }

  if (message.code === "E_IO") {
    return makeAppError("E_IO", message.message, message.recoverable ?? true, {
      scanId,
      targetPath: message.path,
      source: "native-scanner",
    });
  }

  if (message.code === "E_CANCELLED") {
    return makeAppError("E_CANCELLED", message.message, true, {
      scanId,
      source: "native-scanner",
    });
  }

  return makeAppError("E_NATIVE_FAILURE", message.message, message.recoverable ?? true, {
    scanId,
    targetPath: message.path,
    source: "native-scanner",
    nativeCode: message.code,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveQuickPassConfig(
  rootPath: string,
  platform: NodeJS.Platform,
  options: ResolvedScanOptions,
): QuickPassConfig {
  const quickBudgetMs = Math.max(500, options.quickBudgetMs);
  if (isFilesystemRoot(rootPath, platform)) {
    return {
      depthLimit: ROOT_QUICK_PASS_DEPTH,
      timeBudgetMs: quickBudgetMs,
    };
  }

  return {
    depthLimit: QUICK_PASS_DEPTH,
    timeBudgetMs: quickBudgetMs,
  };
}

function resolveScanOptions(
  input: ScanStartRequest,
  normalizedRootPath: string,
): ResolvedScanOptions {
  const isRoot = normalizedRootPath === path.parse(normalizedRootPath).root;
  const performanceProfile = input.performanceProfile ?? "balanced";
  const scanMode: ScanMode =
    input.scanMode ??
    (isRoot && process.platform === "darwin"
      ? "native_rust"
      : "portable");

  const defaultBudget = isRoot
    ? ROOT_QUICK_PASS_TIME_BUDGET_MS
    : DEFAULT_NON_ROOT_QUICK_BUDGET_MS;
  const profileBudget =
    performanceProfile === "accuracy-first"
      ? defaultBudget + 1500
      : performanceProfile === "balanced"
        ? defaultBudget
        : Math.min(defaultBudget, QUICK_PASS_TIME_BUDGET_MS);

  return {
    performanceProfile: isRoot ? "preview-first" : performanceProfile,
    scanMode,
    quickBudgetMs: input.quickBudgetMs ?? profileBudget,
    statConcurrency: resolveStatConcurrency(
      isRoot ? "preview-first" : performanceProfile,
      isRoot,
    ),
  };
}

function isFilesystemRoot(inputPath: string, platform: NodeJS.Platform): boolean {
  const resolved = path.resolve(inputPath);
  const normalized = normalizeForCompare(resolved, platform);
  const root = normalizeForCompare(path.parse(resolved).root, platform);
  return normalized === root;
}

function normalizeForCompare(rawPath: string, platform: NodeJS.Platform): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const rootSafe = normalized === "" ? "/" : normalized;
  if (platform === "win32") {
    return rootSafe.toLowerCase();
  }

  return rootSafe;
}

function enqueueUniquePath(queue: string[], queued: Set<string>, target: string): void {
  if (queued.has(target)) {
    return;
  }

  queued.add(target);
  queue.push(target);
}

function popPriorityDirectory(
  queue: string[],
  sampleSize: number,
  score: (candidate: string) => number,
): string | undefined {
  if (queue.length === 0) {
    return undefined;
  }

  const maxInspect = Math.min(sampleSize, queue.length);
  let bestIndex = 0;
  let bestScore = score(queue[0]);

  for (let index = 1; index < maxInspect; index += 1) {
    const currentScore = score(queue[index]);
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestIndex = index;
    }
  }

  const [selected] = queue.splice(bestIndex, 1);
  return selected;
}

function normalizeIncrementalTarget(changedPath: string): string | null {
  if (!changedPath || typeof changedPath !== "string") {
    return null;
  }

  const resolved = path.resolve(changedPath);
  return path.extname(resolved) ? path.dirname(resolved) : resolved;
}

function shouldStopDeepPassForPreview(
  performanceProfile: ResolvedScanOptions["performanceProfile"],
  rootPath: string,
  platform: NodeJS.Platform,
  deepElapsedMs: number,
): boolean {
  if (performanceProfile !== "preview-first") {
    return false;
  }

  if (!isFilesystemRoot(rootPath, platform)) {
    return false;
  }

  return deepElapsedMs >= PREVIEW_DEEP_BUDGET_ROOT_MS;
}

function resolveStatConcurrency(
  profile: ResolvedScanOptions["performanceProfile"],
  isRoot: boolean,
): number {
  if (profile === "accuracy-first") {
    return Math.max(32, Math.floor(BASE_STAT_CONCURRENCY * 0.75));
  }

  if (profile === "preview-first" && isRoot) {
    return PREVIEW_ROOT_STAT_CONCURRENCY;
  }

  return BASE_STAT_CONCURRENCY;
}

function isHeavyTraversalDirectory(dirPath: string): boolean {
  const normalized = dirPath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  for (const segment of segments) {
    if (HEAVY_DIRECTORY_BASENAMES.has(segment)) {
      return true;
    }
  }

  return false;
}

async function estimateDirectorySizeFast(
  dirPath: string,
  scanMode: ScanMode,
  timeoutMs = FAST_DIRECTORY_ESTIMATE_TIMEOUT_MS,
): Promise<number | null> {
  if (scanMode !== "portable_plus_os_accel") {
    return null;
  }

  if (process.platform === "win32") {
    return null;
  }

  return new Promise((resolve) => {
    const child = spawn("du", ["-sk", dirPath], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }

      const token = output.trim().split(/\s+/)[0];
      const kib = Number.parseInt(token, 10);
      if (!Number.isFinite(kib) || Number.isNaN(kib) || kib <= 0) {
        resolve(null);
        return;
      }

      resolve(kib * 1024);
    });
  });
}
