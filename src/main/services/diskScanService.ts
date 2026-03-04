import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { getProtectedPaths } from "../../shared/platform/protectedPaths";
import type {
  AggDelta,
  AppError,
  ScanAccuracyMode,
  ScanConfidence,
  ScanConcurrencyPolicy,
  ScanCoverage,
  ScanCoverageUpdate,
  ScanDiagnostics,
  ScanEngine,
  ScanElevationPolicy,
  ScanElevationRequired,
  ScanMode,
  ScanPauseResponse,
  ScanPerfSample,
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
import { ScanHistoryStore } from "./cache/scanHistoryStore";
import {
  createNativeScannerSession,
  detectCpuHintFromPlatform,
  type NativeScanPhaseMode,
  type NativeScannerSession,
} from "./native/nativeRustScannerClient";
import { requestElevation as requestElevationByHelper } from "./security/macosPrivilegeHelper";

const DELTA_BATCH_LIMIT = 1024;
const BASE_STAT_CONCURRENCY = 32;
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
const FAST_DIRECTORY_ESTIMATE_TIMEOUT_MS = 1_500;
const HEAVY_BACKGROUND_ESTIMATE_TIMEOUT_MS = 4_000;
const HEAVY_FALLBACK_ESTIMATE_BYTES = 32 * 1024 * 1024;
const HEAVY_DIRECTORY_SCORE_PENALTY = 10_000_000_000_000;
const NATIVE_DEEP_MAX_DEPTH = 128;
const NATIVE_QUICK_ROOT_MAX_DEPTH = 2;
const NATIVE_QUICK_DEFAULT_MAX_DEPTH = 3;
const DEFAULT_AGG_BATCH_MAX_ITEMS = 512;
const DEFAULT_AGG_BATCH_MAX_MS = 120;
const DEFAULT_PROGRESS_INTERVAL_MS = 120;
const DEFAULT_CONCURRENCY_MIN = 16;
const DEFAULT_CONCURRENCY_MAX = 64;
const DEEP_SKIP_PACKAGE_MANAGERS_DEFAULT = process.env.SCAN_DEEP_SKIP_PACKAGE_MANAGERS !== "0";
const DEEP_SKIP_CACHE_PREFIXES_DEFAULT = process.env.SCAN_DEEP_SKIP_CACHE_PREFIXES !== "0";
const DEEP_SKIP_BUNDLE_DIRS_DEFAULT = process.env.SCAN_DEEP_SKIP_BUNDLE_DIRS !== "0";
const HEAVY_DIRECTORY_BASENAMES = new Set([
  "node_modules",
  ".pnpm",
  ".yarn",
  ".cache",
  ".npm",
  ".rustup",
  ".nvm",
  ".rbenv",
  ".pyenv",
  ".asdf",
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
  "SDKs",
  "CommandLineTools",
  "CoreSimulator",
  "gems",
  "site-packages",
  ".git",
  "DerivedData",
  "Caches",
  "Volumes",
  ".Spotlight-V100",
  ".fseventsd",
  "Trash",
  ".Trash",
  "Applications",
  "Library",
  "System",
  "private",
  "cores",
  ".DocumentRevisions-V100",
  ".TemporaryItems",
  ".VolumeIcon.icns",
  ".apdisk",
  ".AppleDouble",
  ".LSOverride",
  ".PKInstallSandboxManager",
  ".PKInstallSandboxManager-SystemSoftware",
  ".Trashes",
]);
const DEEP_PACKAGE_SKIP_BASENAMES = new Set(["node_modules", ".pnpm", ".pnpm-store", ".yarn", ".npm"]);
const PACKAGE_DIRECTORY_SUFFIXES = new Set([
  ".app",
  ".framework",
  ".bundle",
  ".plugin",
  ".kext",
  ".prefpane",
  ".xpc",
  ".appex",
]);

type ScanStage = Exclude<ScanProgress["scanStage"], undefined>;

interface QuickPassConfig {
  depthLimit: number;
  timeBudgetMs: number;
}

interface ResolvedScanOptions {
  performanceProfile: NonNullable<ScanStartRequest["performanceProfile"]>;
  scanMode: ScanMode;
  accuracyMode: ScanAccuracyMode;
  elevationPolicy: ScanElevationPolicy;
  emitPolicy: {
    aggBatchMaxItems: number;
    aggBatchMaxMs: number;
    progressIntervalMs: number;
  };
  concurrencyPolicy: Required<ScanConcurrencyPolicy>;
  allowNodeFallback: boolean;
  deepSkipPackageManagers: boolean;
  deepSkipCachePrefixes: boolean;
  deepSkipBundleDirs: boolean;
  deepSoftSkipPrefixes: string[];
  deepSkipDirSuffixes: string[];
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
  private readonly scanHistoryStore = new ScanHistoryStore();
  private readonly progressListeners = new Set<(batch: ScanProgressBatch) => void>();
  private readonly quickReadyListeners = new Set<(event: ScanQuickReady) => void>();
  private readonly diagnosticsListeners = new Set<(event: ScanDiagnostics) => void>();
  private readonly coverageListeners = new Set<(event: ScanCoverageUpdate) => void>();
  private readonly perfSampleListeners = new Set<(event: ScanPerfSample) => void>();
  private readonly elevationRequiredListeners = new Set<
    (event: ScanElevationRequired) => void
  >();
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

  onCoverage(listener: (event: ScanCoverageUpdate) => void): () => void {
    this.coverageListeners.add(listener);
    return () => this.coverageListeners.delete(listener);
  }

  onPerfSample(listener: (event: ScanPerfSample) => void): () => void {
    this.perfSampleListeners.add(listener);
    return () => this.perfSampleListeners.delete(listener);
  }

  onElevationRequired(listener: (event: ScanElevationRequired) => void): () => void {
    this.elevationRequiredListeners.add(listener);
    return () => this.elevationRequiredListeners.delete(listener);
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

  private getOrCreateNativeSession(scanId: string): NativeScannerSession {
    const existing = this.nativeSessions.get(scanId);
    if (existing) {
      return existing;
    }

    const created = createNativeScannerSession();
    this.nativeSessions.set(scanId, created);
    return created;
  }

  private async runScan(job: ScanJob): Promise<void> {
    if (job.options.scanMode === "native_rust") {
      try {
        await this.runNativeScan(job);
        return;
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
          return;
        }

        job.engine = "node";
        job.fallbackReason = "native-failure-fallback-enabled";
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

      this.emitProgressBatch(job, "walking", false);
      this.emitDiagnostics(job, "walking", quickQueue.length + deepQueue.length, false);
    }

    for (const queued of quickQueue) {
      enqueueDeep(queued.dirPath);
    }

    this.emitQuickReady(job, quickStartedAt);
    await sleep(DEEP_START_GRACE_MS);

    job.scanStage = "deep";
    job.stageStartedAt = Date.now();
    this.emitProgressBatch(job, "walking", true);
    this.emitDiagnostics(job, "walking", deepQueue.length, true);

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

      this.emitProgressBatch(job, "walking", false);
      this.emitDiagnostics(job, "walking", deepQueue.length, false);
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

    this.emitProgressBatch(job, "aggregating", true);
    this.emitDiagnostics(job, "aggregating", deepQueue.length, true);
    this.emitProgressBatch(job, "compressing", true);
    this.emitDiagnostics(job, "compressing", deepQueue.length, true);
    this.emitProgressBatch(job, "finalizing", true);
    this.emitDiagnostics(job, "finalizing", 0, true);
    this.persistScanCache(job);

    job.completed = true;
  }

  private async runNativeScan(job: ScanJob): Promise<void> {
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
        this.emitQuickReady(job, quickStartedAt);
      }

      if (!job.cancelled) {
        await sleep(DEEP_START_GRACE_MS);
      }

      if (!job.cancelled) {
        job.scanStage = "deep";
        job.stageStartedAt = Date.now();
        this.emitProgressBatch(job, "walking", true);
        this.emitDiagnostics(job, "walking", 0, true);

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

      this.emitProgressBatch(job, "aggregating", true);
      this.emitDiagnostics(job, "aggregating", 0, true);
      this.emitProgressBatch(job, "compressing", true);
      this.emitDiagnostics(job, "compressing", 0, true);
      this.emitProgressBatch(job, "finalizing", true);
      this.emitDiagnostics(job, "finalizing", 0, true);
      this.persistScanCache(job);
      job.completed = true;
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
        elevationPolicy: job.options.elevationPolicy,
        emitPolicy: job.options.emitPolicy,
        concurrencyPolicy: job.options.concurrencyPolicy,
        skipBasenames: resolveNativeSkipBasenames(job.options, input.mode),
        softSkipPrefixes: resolveNativeSoftSkipPrefixes(job.options, input.mode),
        skipDirSuffixes: resolveNativeSkipDirSuffixes(job.options, input.mode),
        blockedPrefixes: buildNativeBlockedPrefixes(job, input.mode),
      },
      {
        onMessage: (message) => {
          switch (message.type) {
            case "agg": {
              job.currentPath = message.path;
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
              this.emitProgressBatch(job, "walking", false);
              return;
            }
            case "agg_batch": {
              let lastPath: string | null = null;
              for (const item of message.items) {
                lastPath = item.path;
                if (item.countDelta > 0) {
                  job.totalBytes += item.sizeDelta;
                  const deltas = job.aggregator.addFile(item.path, item.sizeDelta);
                  this.appendDeltas(job, deltas);
                  continue;
                }

                if (item.sizeDelta > 0) {
                  const deltas = job.aggregator.addDirectoryEstimate(
                    item.path,
                    item.sizeDelta,
                  );
                  this.appendDeltas(job, deltas);
                  job.estimatedDirectories.add(item.path);
                }
              }
              if (lastPath) {
                job.currentPath = lastPath;
              }
              this.emitProgressBatch(job, "walking", false);
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
              this.emitCoverageUpdate(job, true);
              return;
            case "diagnostics":
              if (message.hotPath) {
                job.currentPath = message.hotPath;
              }
              this.emitPerfSample(job, {
                filesPerSec: message.filesPerSec,
                stageElapsedMs: message.stageElapsedMs,
                ioWaitRatio: message.ioWaitRatio,
                queueDepth: message.queueDepth,
                hotPath: message.hotPath,
              });
              return;
            case "elevation_required":
              job.elevationRequired = true;
              this.emitElevationRequired(job, message.targetPath, message.reason);
              this.emitCoverageUpdate(job, true);
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

        if (quickQueue === null && this.shouldSkipDeepPackageTraversal(job, fullPath)) {
          this.scheduleDeepPackageDirectoryEstimate(job, fullPath);
          continue;
        }

        if (quickQueue !== null && this.shouldSkipHeavyTraversal(job, fullPath)) {
          this.scheduleHeavyDirectoryEstimate(job, fullPath);
          continue;
        }

        if (
          quickQueue !== null &&
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
      this.emitCoverageUpdate(job, false);
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
      this.emitCoverageUpdate(job, false);
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
    const timeElapsed = now - job.lastEmitAt >= job.options.emitPolicy.progressIntervalMs;

    if (!force && !hasEnoughDeltas && !timeElapsed) {
      return;
    }

    const patch = job.aggregator.consumePatch();

    if (!force && job.pendingDeltaMap.size === 0 && !patch) {
      return;
    }

    const deltas = [...job.pendingDeltaMap.values()];
    const aggBatches = deltas.length > 0 ? [{ items: deltas, emittedAt: now }] : [];

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
      aggBatches,
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
    const elapsedMs = now - job.startedAt;
    const stageElapsedMs = Math.max(0, now - job.stageStartedAt);
    const filesPerSec =
      elapsedMs > 0 ? Number((job.scannedCount / (elapsedMs / 1000)).toFixed(2)) : 0;
    const ioWaitRatio = job.engine === "native" ? 0.35 : 0.55;
    const coverage = this.getCoverage(job);

    const diagnostics = buildScanDiagnostics(
      progress,
      elapsedMs,
      queueDepth,
      {
        recoverableErrors: job.emittedErrorCount,
        permissionErrors: job.permissionErrorCount,
        ioErrors: job.ioErrorCount,
        estimatedDirectories: job.estimatedDirectories.size,
        engine: job.engine,
        fallbackReason: job.fallbackReason,
        cpuHint: job.engine === "native" ? detectCpuHintFromPlatform() : undefined,
        filesPerSec,
        stageElapsedMs,
        ioWaitRatio,
        hotPath: job.currentPath,
        coverage,
      },
    );

    job.diagnosticsLastEmitAt = now;
    for (const listener of this.diagnosticsListeners) {
      listener(diagnostics);
    }
    this.emitCoverageUpdate(job, false);
    this.emitPerfSample(job, {
      filesPerSec,
      stageElapsedMs,
      ioWaitRatio,
      queueDepth,
      hotPath: job.currentPath,
    });
  }

  private getCoverage(job: ScanJob): ScanCoverage {
    return {
      scanned: job.scannedCount,
      blockedByPolicy: job.blockedByPolicyCount,
      blockedByPermission: job.blockedByPermissionCount,
      elevationRequired: job.elevationRequired,
    };
  }

  private emitCoverageUpdate(job: ScanJob, force: boolean): void {
    const now = Date.now();
    if (!force && now - job.lastCoverageEmitAt < 300) {
      return;
    }

    const event: ScanCoverageUpdate = {
      scanId: job.scanId,
      coverage: this.getCoverage(job),
    };
    job.lastCoverageEmitAt = now;
    for (const listener of this.coverageListeners) {
      listener(event);
    }
  }

  private emitPerfSample(
    job: ScanJob,
    input: {
      filesPerSec: number;
      stageElapsedMs: number;
      ioWaitRatio: number;
      queueDepth: number;
      hotPath?: string;
    },
  ): void {
    const sample: ScanPerfSample = {
      scanId: job.scanId,
      filesPerSec: input.filesPerSec,
      stageElapsedMs: input.stageElapsedMs,
      ioWaitRatio: input.ioWaitRatio,
      queueDepth: input.queueDepth,
      hotPath: input.hotPath,
      coverage: this.getCoverage(job),
    };

    for (const listener of this.perfSampleListeners) {
      listener(sample);
    }
  }

  private emitElevationRequired(
    job: ScanJob,
    targetPath: string,
    reason: string,
  ): void {
    const event: ScanElevationRequired = {
      scanId: job.scanId,
      targetPath,
      reason,
      policy: job.options.elevationPolicy,
    };

    for (const listener of this.elevationRequiredListeners) {
      listener(event);
    }

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
          this.emitCoverageUpdate(job, true);
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
      this.appendDeltas(job, deltas);
      job.estimatedDirectories.add(node.path);
    }

    this.emitProgressBatch(job, "walking", true);
    this.emitDiagnostics(job, "walking", 0, true);
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

  private shouldSkipDeepPackageTraversal(job: ScanJob, dirPath: string): boolean {
    const platform = os.platform();
    const normalizedPath = normalizeForCompare(path.resolve(dirPath), platform);
    const normalizedRoot = normalizeForCompare(path.resolve(job.rootPath), platform);
    if (normalizedPath === normalizedRoot) {
      return false;
    }
    if (job.skippedHeavyDirectories.has(dirPath)) {
      return false;
    }

    if (job.options.deepSkipPackageManagers && isDeepPackageSkipDirectory(dirPath)) {
      return true;
    }

    if (
      job.options.deepSkipBundleDirs &&
      hasSkippedDirectorySuffix(dirPath, job.options.deepSkipDirSuffixes)
    ) {
      return true;
    }

    if (
      job.options.deepSkipCachePrefixes &&
      pathMatchesAnyPrefix(normalizedPath, job.options.deepSoftSkipPrefixes)
    ) {
      return true;
    }

    return false;
  }

  private scheduleDeepPackageDirectoryEstimate(job: ScanJob, dirPath: string): void {
    if (job.skippedHeavyDirectories.has(dirPath)) {
      return;
    }

    job.skippedHeavyDirectories.add(dirPath);
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
      this.appendDeltas(job, deltas);
      job.estimatedDirectories.add(dirPath);
      this.emitProgressBatch(job, "walking", false);
    });
  }

  private shouldSkipHeavyTraversal(job: ScanJob, dirPath: string): boolean {
    if (job.options.performanceProfile !== "preview-first") {
      return false;
    }

    if (!isHeavyTraversalDirectory(dirPath)) {
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

function buildNativeBlockedPrefixes(
  job: ScanJob,
  mode: NativeScanPhaseMode,
): string[] {
  const policy = getProtectedPaths(os.platform(), os.homedir());
  const blocked = [...policy.absoluteBlock];
  if (!job.optInProtected) {
    blocked.push(...policy.optInRequired);
  }

  const unique = new Set<string>();
  for (const raw of blocked) {
    const resolved = path.resolve(raw);
    const normalized = normalizeForNativePrefix(resolved, os.platform());
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique].sort((left, right) => right.length - left.length);
}

function normalizeForNativePrefix(rawPath: string, platform: NodeJS.Platform): string {
  const normalized = rawPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const rootSafe = normalized === "" ? "/" : normalized;
  if (platform === "win32") {
    return rootSafe.toLowerCase();
  }

  return rootSafe;
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
  const performanceProfile = input.performanceProfile ?? "accuracy-first";
  const scanMode: ScanMode =
    input.scanMode ?? (process.platform === "darwin" ? "native_rust" : "portable");
  const accuracyMode: ScanAccuracyMode = input.accuracyMode ?? "full";
  const elevationPolicy: ScanElevationPolicy = input.elevationPolicy ?? "manual";
  const emitPolicy = {
    aggBatchMaxItems: Math.max(
      64,
      Math.min(20_000, input.emitPolicy?.aggBatchMaxItems ?? DEFAULT_AGG_BATCH_MAX_ITEMS),
    ),
    aggBatchMaxMs: Math.max(
      20,
      Math.min(5_000, input.emitPolicy?.aggBatchMaxMs ?? DEFAULT_AGG_BATCH_MAX_MS),
    ),
    progressIntervalMs: Math.max(
      80,
      Math.min(
        5_000,
        input.emitPolicy?.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS,
      ),
    ),
  };
  const concurrencyPolicy = resolveConcurrencyPolicy(input.concurrencyPolicy);
  const allowNodeFallback =
    Boolean(input.allowNodeFallback) || process.env.SCAN_ALLOW_NODE_FALLBACK === "1";
  const deepSkipPackageManagers = DEEP_SKIP_PACKAGE_MANAGERS_DEFAULT;
  const deepSkipCachePrefixes = DEEP_SKIP_CACHE_PREFIXES_DEFAULT;
  const deepSkipBundleDirs = DEEP_SKIP_BUNDLE_DIRS_DEFAULT;
  const deepSoftSkipPrefixes = resolveDeepSoftSkipPrefixes(
    os.platform(),
    os.homedir(),
    deepSkipCachePrefixes,
  );
  const deepSkipDirSuffixes = resolveDeepSkipDirSuffixes(deepSkipBundleDirs);

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
    performanceProfile,
    scanMode,
    accuracyMode,
    elevationPolicy,
    emitPolicy,
    concurrencyPolicy,
    allowNodeFallback,
    deepSkipPackageManagers,
    deepSkipCachePrefixes,
    deepSkipBundleDirs,
    deepSoftSkipPrefixes,
    deepSkipDirSuffixes,
    quickBudgetMs: input.quickBudgetMs ?? profileBudget,
    statConcurrency: resolveStatConcurrency(
      performanceProfile,
      isRoot,
      concurrencyPolicy,
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

function resolveStatConcurrency(
  profile: ResolvedScanOptions["performanceProfile"],
  isRoot: boolean,
  policy: Required<ScanConcurrencyPolicy>,
): number {
  const min = Math.max(1, policy.min);
  const max = Math.max(min, policy.max);

  if (!policy.adaptive) {
    return max;
  }

  let desired = BASE_STAT_CONCURRENCY;
  if (profile === "preview-first" && isRoot) {
    desired = Math.min(max, desired + 8);
  } else if (profile === "accuracy-first") {
    desired = Math.max(min, desired);
  }

  return Math.max(min, Math.min(max, desired));
}

function resolveConcurrencyPolicy(
  input: ScanStartRequest["concurrencyPolicy"],
): Required<ScanConcurrencyPolicy> {
  const min = Math.max(1, input?.min ?? DEFAULT_CONCURRENCY_MIN);
  const max = Math.max(min, input?.max ?? DEFAULT_CONCURRENCY_MAX);
  const adaptive = input?.adaptive ?? true;

  return { min, max, adaptive };
}

function resolveNativeSkipBasenames(
  options: ResolvedScanOptions,
  mode: NativeScanPhaseMode,
): string[] {
  if (mode === "quick") {
    return [...HEAVY_DIRECTORY_BASENAMES];
  }
  if (options.deepSkipPackageManagers) {
    return [...DEEP_PACKAGE_SKIP_BASENAMES];
  }
  return [];
}

function resolveNativeSoftSkipPrefixes(
  options: ResolvedScanOptions,
  mode: NativeScanPhaseMode,
): string[] {
  if (mode !== "deep" || !options.deepSkipCachePrefixes) {
    return [];
  }

  const unique = new Set<string>();
  for (const normalized of options.deepSoftSkipPrefixes) {
    const nativeNormalized = normalizeForNativePrefix(normalized, os.platform());
    unique.add(nativeNormalized);
  }

  return [...unique].sort((left, right) => right.length - left.length);
}

function resolveNativeSkipDirSuffixes(
  options: ResolvedScanOptions,
  mode: NativeScanPhaseMode,
): string[] {
  if (mode !== "deep" || !options.deepSkipBundleDirs) {
    return [];
  }

  return [...options.deepSkipDirSuffixes];
}

function resolveDeepSoftSkipPrefixes(
  platform: NodeJS.Platform,
  homeDirectory: string,
  enabled: boolean,
): string[] {
  if (!enabled) {
    return [];
  }

  const raw = [
    path.join(homeDirectory, "Library", "Caches"),
    "/Library/Caches",
    "/private/var/folders",
  ];
  const unique = new Set<string>();
  for (const item of raw) {
    unique.add(normalizeForCompare(path.resolve(item), platform));
  }
  return [...unique].sort((left, right) => right.length - left.length);
}

function resolveDeepSkipDirSuffixes(enabled: boolean): string[] {
  if (!enabled) {
    return [];
  }
  return [...PACKAGE_DIRECTORY_SUFFIXES];
}

function isDeepPackageSkipDirectory(dirPath: string): boolean {
  return DEEP_PACKAGE_SKIP_BASENAMES.has(path.basename(dirPath).toLowerCase());
}

function hasSkippedDirectorySuffix(dirPath: string, suffixes: string[]): boolean {
  if (suffixes.length === 0) {
    return false;
  }
  const basename = path.basename(dirPath).toLowerCase();
  for (const suffix of suffixes) {
    if (basename.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

function pathMatchesAnyPrefix(candidate: string, prefixes: string[]): boolean {
  for (const prefix of prefixes) {
    if (candidate === prefix || candidate.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
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
