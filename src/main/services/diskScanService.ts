import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type {
  AggDelta,
  AppError,
  ScanConfidence,
  ScanCoverageUpdate,
  ScanDiagnostics,
  ScanEngine,
  ScanElevationRequired,
  ScanPauseResponse,
  ScanPerfSample,
  ScanProgress,
  ScanProgressBatch,
  ScanQuickReady,
  ScanResumeResponse,
  ScanStartRequest,
  ScanStartResponse,
  ScanTerminalEvent,
  ScanTerminalStatus,
} from "../../types/contracts";
import {
  createPathPolicyClassifier,
  evaluateRootPath,
  type PathPolicyClassifier,
} from "../core/securityPolicy";
import { makeAppError, unknownToAppError } from "../utils/appError";
import {
  createMacOSIncrementalWatcher,
  type IncrementalWatcherHandle,
} from "./accelerators/macosIncrementalWatcher";
import { buildMacOSQuickQueue } from "./accelerators/macosQuickScanner";
import { buildQuickReadyPayload } from "./diagnostics/scanDiagnostics";
import { ScanEventBus } from "./scan/scanEventBus";
import { ScanAggregator } from "./scanAggregator";
import { ScanHistoryStore } from "./cache/scanHistoryStore";
import {
  createNativeScannerSession,
  type NativeScanPhaseMode,
  type NativeScannerSession,
} from "./native/nativeRustScannerClient";
import {
  enqueueUniquePath,
  normalizeIncrementalTarget,
  popPriorityDirectory,
} from "./scan/scanQueueUtils";
import {
  isFilesystemRoot,
  resolveQuickPassConfig,
  resolveScanOptions,
  type ResolvedScanOptions,
} from "./scan/scanRuntimeOptions";
import {
  buildNativeBlockedPrefixes,
  estimateDirectorySizeFast,
  isHeavyTraversalDirectory,
  resolveNativeSkipBasenames,
  resolveNativeSkipDirSuffixes,
  resolveNativeSoftSkipPrefixes,
  shouldEstimateDirectory,
  shouldSkipDeepPackageTraversal,
  shouldSkipHeavyTraversal,
} from "./scan/scanTraversalPolicy";
import { requestElevation as requestElevationByHelper } from "./security/macosPrivilegeHelper";

const TOP_LIMIT_PER_DIRECTORY = 200;
const MAX_RECOVERABLE_ERRORS = 100;
const ENTRY_YIELD_INTERVAL = 1024;
const DEEP_PRIORITY_SAMPLE_SIZE = 64;
const DEEP_START_GRACE_MS = 500;
const INCREMENTAL_IDLE_GRACE_MS = 1000;
const HEAVY_BACKGROUND_ESTIMATE_TIMEOUT_MS = 4_000;
const HEAVY_FALLBACK_ESTIMATE_BYTES = 32 * 1024 * 1024;
const HEAVY_DIRECTORY_SCORE_PENALTY = 10_000_000_000_000;
const NATIVE_DEEP_MAX_DEPTH = 128;
const NATIVE_QUICK_ROOT_MAX_DEPTH = 2;
const NATIVE_QUICK_DEFAULT_MAX_DEPTH = 3;

type ScanStage = Exclude<ScanProgress["scanStage"], undefined>;

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
  blockedByPolicyCount: number;
  blockedByPermissionCount: number;
  elevationRequired: boolean;
  elevationAttempted: boolean;
  lastCoverageEmitAt: number;
  stageStartedAt: number;
  emittedErrorCount: number;
  permissionErrorCount: number;
  ioErrorCount: number;
  quickReadyEmitted: boolean;
  estimatedResult: boolean;
  diagnosticsLastEmitAt: number;
  estimatedDirectories: Set<string>;
  skippedHeavyDirectories: Set<string>;
  deepSkippedByPolicy: boolean;
  softSkippedByPolicyCount: number;
  deferredByBudgetCount: number;
  inflightCount: number;
  options: ResolvedScanOptions;
  engine: ScanEngine;
  fallbackReason?: string;
  aggregator: ScanAggregator;
  pathClassifier: PathPolicyClassifier;
  scanStage: ScanStage;
}

export class DiskScanService {
  private readonly eventBus = new ScanEventBus();
  private readonly jobs = new Map<string, ScanJob>();
  private readonly nativeSessions = new Map<string, NativeScannerSession>();
  private readonly scanHistoryStore = new ScanHistoryStore();

  onProgress(listener: (batch: ScanProgressBatch) => void): () => void {
    return this.eventBus.onProgress(listener);
  }

  onError(listener: (error: AppError) => void): () => void {
    return this.eventBus.onError(listener);
  }

  onQuickReady(listener: (event: ScanQuickReady) => void): () => void {
    return this.eventBus.onQuickReady(listener);
  }

  onDiagnostics(listener: (event: ScanDiagnostics) => void): () => void {
    return this.eventBus.onDiagnostics(listener);
  }

  onCoverage(listener: (event: ScanCoverageUpdate) => void): () => void {
    return this.eventBus.onCoverage(listener);
  }

  onTerminal(listener: (event: ScanTerminalEvent) => void): () => void {
    return this.eventBus.onTerminal(listener);
  }

  onPerfSample(listener: (event: ScanPerfSample) => void): () => void {
    return this.eventBus.onPerfSample(listener);
  }

  onElevationRequired(listener: (event: ScanElevationRequired) => void): () => void {
    return this.eventBus.onElevationRequired(listener);
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
      blockedByPolicyCount: 0,
      blockedByPermissionCount: 0,
      elevationRequired: false,
      elevationAttempted: false,
      lastCoverageEmitAt: startedAt,
      stageStartedAt: startedAt,
      emittedErrorCount: 0,
      permissionErrorCount: 0,
      ioErrorCount: 0,
      quickReadyEmitted: false,
      estimatedResult: true,
      diagnosticsLastEmitAt: startedAt,
      estimatedDirectories: new Set<string>(),
      skippedHeavyDirectories: new Set<string>(),
      deepSkippedByPolicy: false,
      softSkippedByPolicyCount: 0,
      deferredByBudgetCount: 0,
      inflightCount: 0,
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
    this.applyCachedPreview(job);

    void this.runScan(job)
      .then((status) => {
        this.eventBus.emitTerminal(job.scanId, status);
      })
      .catch((error) => {
        const appError = unknownToAppError(error);
        this.emitError({
          ...appError,
          recoverable: false,
        });
        this.eventBus.emitTerminal(job.scanId, "failed");
      })
      .finally(() => {
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
    this.eventBus.emitProgressBatch(job, "paused", true);
    return { ok: true };
  }

  resumeScan(scanId: string): ScanResumeResponse {
    const job = this.jobs.get(scanId);
    if (!job || job.completed || job.cancelled) {
      return { ok: false };
    }

    job.paused = false;
    this.nativeSessions.get(scanId)?.sendControl("resume");
    this.eventBus.emitProgressBatch(job, "walking", true);
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
    this.eventBus.emitError(error);
  }

  private getOrCreateNativeSession(scanId: string): NativeScannerSession {
    const existing = this.nativeSessions.get(scanId);
    if (existing) {
      return existing;
    }

    const created = createNativeScannerSession();
    this.nativeSessions.set(scanId, created);
    return created;
  }

  private async runScan(job: ScanJob): Promise<ScanTerminalStatus> {
    if (job.options.scanMode === "native_rust") {
      try {
        return await this.runNativeScan(job);
      } catch (error) {
        const nativeFailure = makeAppError(
          "E_NATIVE_FAILURE",
          "Native scanner failed",
          false,
          {
            scanId: job.scanId,
            rootPath: job.rootPath,
            raw: String(error),
          },
        );
        this.emitError(nativeFailure);

        if (!job.options.allowNodeFallback) {
          job.completed = true;
          return "failed";
        }

        job.engine = "node";
        job.fallbackReason = "native-failure-fallback-enabled";
        job.options.scanMode = process.platform === "darwin"
          ? "portable_plus_os_accel"
          : "portable";
      }
    }

    return await this.runPortableScan(job);
  }

  private async runPortableScan(job: ScanJob): Promise<ScanTerminalStatus> {
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
    job.stageStartedAt = quickStartedAt;

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
        const result = await this.processDirectory(
          job,
          current,
          quickQueue,
          enqueueDeep,
          quickConfig.depthLimit,
          quickStartedAt + quickConfig.timeBudgetMs,
        );
        if (result.timedOut) {
          break;
        }
      } catch (error) {
        this.emitRecoverableError(
          job,
          toFilesystemError(error, current.dirPath, "Failed to process directory"),
        );
      }

      this.eventBus.emitProgressBatch(job, "walking", false);
      this.eventBus.emitDiagnostics(
        job,
        "walking",
        quickQueue.length + deepQueue.length,
        false,
      );
    }

    for (const queued of quickQueue) {
      enqueueDeep(queued.dirPath);
    }

    this.eventBus.emitQuickReady(job, quickStartedAt);
    await sleep(DEEP_START_GRACE_MS);

    job.scanStage = "deep";
    job.stageStartedAt = Date.now();
    this.eventBus.emitProgressBatch(job, "walking", true);
    this.eventBus.emitDiagnostics(job, "walking", deepQueue.length, true);

    let lastIncrementalChangeAt = 0;
    const deepDeadlineAt: number | null = null;
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
        const result = await this.processDirectory(
          job,
          { dirPath: nextDir, depth: 0 },
          null,
          enqueueDeep,
          0,
          deepDeadlineAt ?? undefined,
        );
        if (result.timedOut) {
          deepBudgetExceeded = true;
          break;
        }
      } catch (error) {
        this.emitRecoverableError(
          job,
          toFilesystemError(error, nextDir, "Failed to process directory"),
        );
      }

      this.eventBus.emitProgressBatch(job, "walking", false);
      this.eventBus.emitDiagnostics(job, "walking", deepQueue.length, false);
    }

    watcher?.close();

    if (!job.cancelled && !deepBudgetExceeded && !job.deepSkippedByPolicy) {
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

    this.eventBus.emitProgressBatch(job, "aggregating", true);
    this.eventBus.emitDiagnostics(job, "aggregating", deepQueue.length, true);
    this.eventBus.emitProgressBatch(job, "compressing", true);
    this.eventBus.emitDiagnostics(job, "compressing", deepQueue.length, true);
    this.eventBus.emitProgressBatch(job, "finalizing", true);
    this.eventBus.emitDiagnostics(job, "finalizing", 0, true);
    this.persistScanCache(job);

    job.completed = true;
    return job.cancelled ? "canceled" : "done";
  }

  private async runNativeScan(job: ScanJob): Promise<ScanTerminalStatus> {
    job.engine = "native";
    job.scanStage = "quick";
    const session = this.getOrCreateNativeSession(job.scanId);

    try {
      const quickStartedAt = Date.now();
      job.stageStartedAt = quickStartedAt;
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
        this.eventBus.emitQuickReady(job, quickStartedAt);
      }

      if (!job.cancelled) {
        await sleep(DEEP_START_GRACE_MS);
      }

      if (!job.cancelled) {
        job.scanStage = "deep";
        job.stageStartedAt = Date.now();
        this.eventBus.emitProgressBatch(job, "walking", true);
        this.eventBus.emitDiagnostics(job, "walking", 0, true);

        const deepBudgetMs = 0;

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

      this.eventBus.emitProgressBatch(job, "aggregating", true);
      this.eventBus.emitDiagnostics(job, "aggregating", 0, true);
      this.eventBus.emitProgressBatch(job, "compressing", true);
      this.eventBus.emitDiagnostics(job, "compressing", 0, true);
      this.eventBus.emitProgressBatch(job, "finalizing", true);
      this.eventBus.emitDiagnostics(job, "finalizing", 0, true);
      this.persistScanCache(job);
      job.completed = true;
      return job.cancelled ? "canceled" : "done";
    } finally {
      session.dispose();
      this.nativeSessions.delete(job.scanId);
    }
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

    const session = this.getOrCreateNativeSession(job.scanId);
    if (job.paused) {
      session.sendControl("pause");
    }
    if (job.cancelled) {
      session.sendControl("cancel");
    }

    await session.runStage(
      {
        scanId: job.scanId,
        root: job.rootPath,
        mode: input.mode,
        platform: os.platform(),
        timeBudgetMs: input.timeBudgetMs,
        maxDepth: input.maxDepth,
        sameDeviceOnly: true,
        concurrency: job.options.statConcurrency,
        accuracyMode: job.options.accuracyMode,
        deepPolicyPreset: job.options.deepPolicyPreset,
        elevationPolicy: job.options.elevationPolicy,
        emitPolicy: job.options.emitPolicy,
        concurrencyPolicy: job.options.concurrencyPolicy,
        skipBasenames: resolveNativeSkipBasenames(job.options, input.mode),
        softSkipPrefixes: resolveNativeSoftSkipPrefixes(
          job.options,
          input.mode,
          os.platform(),
        ),
        skipDirSuffixes: resolveNativeSkipDirSuffixes(job.options, input.mode),
        blockedPrefixes: buildNativeBlockedPrefixes(
          os.platform(),
          os.homedir(),
          job.optInProtected,
        ),
      },
      {
        onMessage: (message) => {
          switch (message.type) {
            case "agg": {
              job.currentPath = message.path;
              if (message.countDelta > 0) {
                job.totalBytes += message.sizeDelta;
                const deltas = job.aggregator.addFile(message.path, message.sizeDelta);
                this.eventBus.appendDeltas(job, deltas);
              } else if (message.sizeDelta > 0) {
                const deltas = job.aggregator.addDirectoryEstimate(
                  message.path,
                  message.sizeDelta,
                );
                this.eventBus.appendDeltas(job, deltas);
                job.estimatedDirectories.add(message.path);
              }
              this.eventBus.emitProgressBatch(job, "walking", false);
              return;
            }
            case "agg_batch": {
              let lastPath: string | null = null;
              for (const item of message.items) {
                lastPath = item.path;
                if (item.countDelta > 0) {
                  job.totalBytes += item.sizeDelta;
                  const deltas = job.aggregator.addFile(item.path, item.sizeDelta);
                  this.eventBus.appendDeltas(job, deltas);
                  continue;
                }

                if (item.sizeDelta > 0) {
                  const deltas = job.aggregator.addDirectoryEstimate(
                    item.path,
                    item.sizeDelta,
                  );
                  this.eventBus.appendDeltas(job, deltas);
                  job.estimatedDirectories.add(item.path);
                }
              }
              if (lastPath) {
                job.currentPath = lastPath;
              }
              this.eventBus.emitProgressBatch(job, "walking", false);
              return;
            }
            case "progress":
              job.scannedCount = Math.max(job.scannedCount, message.scannedCount);
              queueDepth = message.queuedDirs;
              if (message.currentPath) {
                job.currentPath = message.currentPath;
              }
              this.eventBus.emitProgressBatch(job, "walking", false);
              this.eventBus.emitDiagnostics(job, "walking", queueDepth, false);
              return;
            case "coverage":
              job.blockedByPolicyCount = Math.max(
                job.blockedByPolicyCount,
                message.blockedByPolicy,
              );
              job.blockedByPermissionCount = Math.max(
                job.blockedByPermissionCount,
                message.blockedByPermission,
              );
              job.elevationRequired =
                job.elevationRequired || Boolean(message.elevationRequired);
              this.eventBus.emitCoverageUpdate(job, true);
              return;
            case "diagnostics":
              if (message.hotPath) {
                job.currentPath = message.hotPath;
              }
              if (typeof message.softSkippedByPolicy === "number") {
                job.softSkippedByPolicyCount = Math.max(
                  job.softSkippedByPolicyCount,
                  message.softSkippedByPolicy,
                );
              }
              if (typeof message.deferredByBudget === "number") {
                job.deferredByBudgetCount = Math.max(
                  job.deferredByBudgetCount,
                  message.deferredByBudget,
                );
              }
              if (typeof message.inflight === "number") {
                job.inflightCount = message.inflight;
              }
              this.eventBus.emitPerfSample(job, {
                filesPerSec: message.filesPerSec,
                stageElapsedMs: message.stageElapsedMs,
                ioWaitRatio: message.ioWaitRatio,
                queueDepth: message.queueDepth,
                hotPath: message.hotPath,
                softSkippedByPolicy: message.softSkippedByPolicy,
                deferredByBudget: message.deferredByBudget,
                inflight: message.inflight,
              });
              return;
            case "elevation_required":
              job.elevationRequired = true;
              this.emitElevationRequired(job, message.targetPath, message.reason);
              this.eventBus.emitCoverageUpdate(job, true);
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
              this.eventBus.emitProgressBatch(job, "walking", true);
              this.eventBus.emitDiagnostics(job, "walking", queueDepth, true);
              return;
            default:
              return;
          }
        },
      },
    );

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
    this.eventBus.emitQuickReadyEvent(
      buildQuickReadyPayload({
        scanId: job.scanId,
        rootPath: job.rootPath,
        quickReadyAt,
        elapsedMs: event.elapsedMs,
        confidence: event.confidence,
        estimated: event.estimated,
      }),
    );
  }

  private async processDirectory(
    job: ScanJob,
    current: QueueItem,
    quickQueue: QueueItem[] | null,
    enqueueDeep: (dirPath: string) => void,
    quickDepthLimit: number,
    deadlineAtMs?: number,
  ): Promise<{ timedOut: boolean }> {
    const dir = await fs.opendir(current.dirPath, { bufferSize: 256 });
    let entryCounter = 0;

    for await (const entry of dir) {
      if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
        return { timedOut: true };
      }

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
        if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
          return { timedOut: true };
        }
      }

      if (!this.classifyPathOrEmit(job, fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        this.ensureDirectoryInAggregation(job, fullPath, current.dirPath);

        if (
          quickQueue === null &&
          shouldSkipDeepPackageTraversal({
            options: job.options,
            rootPath: job.rootPath,
            dirPath: fullPath,
            platform: os.platform(),
            skippedDirectories: job.skippedHeavyDirectories,
          })
        ) {
          this.scheduleDeepPackageDirectoryEstimate(job, fullPath);
          continue;
        }

        if (
          quickQueue !== null &&
          shouldSkipHeavyTraversal(
            job.options,
            fullPath,
            job.skippedHeavyDirectories,
          )
        ) {
          this.scheduleHeavyDirectoryEstimate(job, fullPath);
          continue;
        }

        if (
          quickQueue !== null &&
          shouldEstimateDirectory(job.options, fullPath, job.estimatedDirectories) &&
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
            this.eventBus.appendDeltas(job, estimateDeltas);
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
          this.eventBus.appendDeltas(job, deltas);
        } catch (error) {
          this.emitRecoverableError(
            job,
            toFilesystemError(error, fullPath, "Failed to stat file"),
          );
        }

        this.eventBus.emitProgressBatch(job, "walking", false);
      });
    }

    if (deadlineAtMs !== undefined && Date.now() >= deadlineAtMs) {
      return { timedOut: true };
    }

    return { timedOut: false };
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
      job.blockedByPolicyCount += 1;
      if (decision.requiresOptIn) {
        job.elevationRequired = true;
        this.emitElevationRequired(
          job,
          decision.normalizedPath,
          "Protected path requires explicit elevation/opt-in",
        );
      }
      this.eventBus.emitCoverageUpdate(job, false);
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
      job.blockedByPermissionCount += 1;
      this.eventBus.emitCoverageUpdate(job, false);
    } else if (error.code === "E_IO") {
      job.ioErrorCount += 1;
    }
    this.emitError(error);
  }

  private readonly activeStatTasks = new WeakMap<ScanJob, Set<Promise<void>>>();

  private async scheduleStatTask(
    job: ScanJob,
    task: () => Promise<void>,
  ): Promise<void> {
    const tasks = this.activeStatTasks.get(job) ?? new Set<Promise<void>>();
    this.activeStatTasks.set(job, tasks);
    job.inflightCount = tasks.size;

    while (tasks.size >= job.options.statConcurrency && !job.cancelled) {
      await Promise.race(tasks);
      await this.waitWhilePaused(job);
      job.inflightCount = tasks.size;
    }

    const running = task()
      .catch(() => undefined)
      .finally(() => {
        tasks.delete(running);
        job.inflightCount = tasks.size;
      });

    tasks.add(running);
    job.inflightCount = tasks.size;
  }

  private async flushStatTasks(job: ScanJob): Promise<void> {
    const tasks = this.activeStatTasks.get(job);
    if (!tasks || tasks.size === 0) {
      return;
    }

    await Promise.allSettled(tasks);
    tasks.clear();
    job.inflightCount = 0;
  }

  private async waitWhilePaused(job: ScanJob): Promise<void> {
    while (job.paused && !job.cancelled) {
      this.eventBus.emitProgressBatch(job, "paused", false);
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

  private emitElevationRequired(
    job: ScanJob,
    targetPath: string,
    reason: string,
  ): void {
    this.eventBus.emitElevationRequired(job, targetPath, reason);

    if (
      process.platform === "darwin" &&
      job.options.elevationPolicy === "auto" &&
      !job.elevationAttempted
    ) {
      job.elevationAttempted = true;
      void requestElevationByHelper(targetPath)
        .then((result) => {
          if (!result.granted || job.cancelled) {
            return;
          }

          job.optInProtected = true;
          job.elevationRequired = false;
          this.eventBus.emitCoverageUpdate(job, true);
        })
        .catch(() => undefined);
    }
  }

  private applyCachedPreview(job: ScanJob): void {
    const cacheEntry = this.scanHistoryStore.get(job.rootPath);
    if (!cacheEntry || cacheEntry.nodes.length === 0) {
      return;
    }

    for (const node of cacheEntry.nodes) {
      if (!this.classifyPathOrEmit(job, node.path)) {
        continue;
      }
      const deltas = job.aggregator.addDirectoryEstimate(node.path, node.size);
      this.eventBus.appendDeltas(job, deltas);
      job.estimatedDirectories.add(node.path);
    }

    this.eventBus.emitProgressBatch(job, "walking", true);
    this.eventBus.emitDiagnostics(job, "walking", 0, true);
  }

  private persistScanCache(job: ScanJob): void {
    const nodes = job.aggregator.getLargestDirectories(300).map((item) => ({
      path: item.path,
      size: item.size,
    }));
    if (nodes.length === 0) {
      return;
    }

    this.scanHistoryStore.set(job.rootPath, nodes);
  }

  private scheduleDeepPackageDirectoryEstimate(job: ScanJob, dirPath: string): void {
    if (job.skippedHeavyDirectories.has(dirPath)) {
      return;
    }

    job.skippedHeavyDirectories.add(dirPath);
    this.recordPolicySoftSkip(job);
    job.deepSkippedByPolicy = true;
    job.estimatedResult = true;

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
      this.eventBus.appendDeltas(job, deltas);
      job.estimatedDirectories.add(dirPath);
      this.eventBus.emitProgressBatch(job, "walking", false);
    });
  }

  private scheduleHeavyDirectoryEstimate(job: ScanJob, dirPath: string): void {
    if (job.skippedHeavyDirectories.has(dirPath)) {
      return;
    }

    job.skippedHeavyDirectories.add(dirPath);
    this.recordPolicySoftSkip(job);

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
      this.eventBus.appendDeltas(job, deltas);
      job.estimatedDirectories.add(dirPath);
      this.eventBus.emitProgressBatch(job, "walking", false);
    });
  }

  private recordPolicySoftSkip(
    job: ScanJob,
    input?: { deferredByBudget?: boolean },
  ): void {
    job.blockedByPolicyCount += 1;
    job.softSkippedByPolicyCount += 1;
    if (input?.deferredByBudget) {
      job.deferredByBudgetCount += 1;
    }
    this.eventBus.emitCoverageUpdate(job, false);
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
