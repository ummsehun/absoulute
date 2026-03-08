import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import type {
  AggDelta,
  AppError,
  ScanConfidence,
  ScanCoverageUpdate,
  ScanDiagnostics,
  ScanElevationRequired,
  ScanPauseResponse,
  ScanPerfSample,
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
} from "../core/securityPolicy";
import { makeAppError, unknownToAppError } from "../utils/appError";
import { buildQuickReadyPayload } from "./diagnostics/scanDiagnostics";
import { ScanEventBus } from "./scan/scanEventBus";
import { ScanAggregator } from "./scanAggregator";
import { ScanHistoryStore } from "./cache/scanHistoryStore";
import {
  NativeScanOrchestrator,
  type NativeStageContext,
  type NativeStageHandlers,
} from "./scan/nativeScanOrchestrator";
import { PortableScanService } from "./scan/portableScanService";
import { ScanPolicyService } from "./scan/scanPolicyService";
import {
  isFilesystemRoot,
  resolveScanOptions,
} from "./scan/scanRuntimeOptions";
import { type ScanJob } from "./scan/scanSessionTypes";

const TOP_LIMIT_PER_DIRECTORY = 200;
const MAX_RECOVERABLE_ERRORS = 100;
const DEEP_START_GRACE_MS = 500;
const NATIVE_DEEP_MAX_DEPTH = 128;
const NATIVE_QUICK_ROOT_MAX_DEPTH = 2;
const NATIVE_QUICK_DEFAULT_MAX_DEPTH = 3;

export class DiskScanService {
  private readonly eventBus = new ScanEventBus();
  private readonly jobs = new Map<string, ScanJob>();
  private readonly nativeScanOrchestrator = new NativeScanOrchestrator();
  private readonly scanHistoryStore = new ScanHistoryStore();
  private readonly scanPolicyService = new ScanPolicyService({
    eventBus: this.eventBus,
    maxRecoverableErrors: MAX_RECOVERABLE_ERRORS,
    emitError: (error) => this.emitError(error),
    scanHistoryStore: this.scanHistoryStore,
  });
  private readonly portableScanService = new PortableScanService({
    classifyPathOrEmit: (job, targetPath) =>
      this.scanPolicyService.classifyPathOrEmit(job, targetPath),
    createCanceledError: (scanId) =>
      makeAppError("E_CANCELLED", "Scan was cancelled by user", true, {
        scanId,
      }),
    emitRecoverableError: (job, error) =>
      this.scanPolicyService.emitRecoverableError(job, error),
    eventBus: this.eventBus,
    flushStatTasks: (job) => this.flushStatTasks(job),
    hasPendingStatTasks: (job) => this.hasPendingStatTasks(job),
    persistScanCache: (job) => this.scanPolicyService.persistScanCache(job),
    recordEstimatedDirectory: (job, dirPath, estimatedSize) =>
      this.scanPolicyService.recordEstimatedDirectory(job, dirPath, estimatedSize),
    recordFileObservation: (job, filePath, fileSize) =>
      this.scanPolicyService.recordFileObservation(job, filePath, fileSize),
    recordPolicySoftSkip: (job, input) =>
      this.scanPolicyService.recordPolicySoftSkip(job, input),
    recordScopeSkip: (job) => this.scanPolicyService.recordScopeSkip(job),
    scheduleStatTask: (job, task) => this.scheduleStatTask(job, task),
    syncExactTraversal: (job, targetPath) =>
      this.scanPolicyService.syncExactTraversal(job, targetPath),
    toFilesystemError,
    waitForNextStatTask: (job) => this.waitForNextStatTask(job),
    waitWhilePaused: (job) => this.waitWhilePaused(job),
  });

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
    if (!rootDecision.scanAllowed && rootDecision.error) {
      throw rootDecision.error;
    }

    await this.scanPolicyService.assertPathReadable(rootDecision.normalizedPath);
    const rootStat = await fs.stat(rootDecision.normalizedPath).catch(() => null);

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
      skippedByScopeCount: 0,
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
      rootDeviceId:
        rootStat && typeof rootStat.dev === "number" && Number.isFinite(rootStat.dev)
          ? rootStat.dev
          : null,
      deniedPermissionRoots:
        rootDecision.effectiveAccess?.deniedPermissionRoots ?? [],
      nonRemovableRoots: rootDecision.effectiveAccess?.nonRemovableRoots ?? [],
      visibleNonRemovableRoots: new Set<string>(),
      options,
      engine: options.scanMode === "native_rust" ? "native" : "node",
      aggregator: new ScanAggregator(
        rootDecision.normalizedPath,
        TOP_LIMIT_PER_DIRECTORY,
        os.platform(),
      ),
      pathClassifier: createPathPolicyClassifier(
        os.platform(),
        os.homedir(),
        rootDecision.effectiveAccess,
      ),
      scanStage: "quick",
    };

    this.jobs.set(scanId, job);
    this.scanPolicyService.applyCachedPreview(job);

    void this.runScan(job)
      .then((status) => {
        this.eventBus.emitTerminalEvent(job, status);
      })
      .catch((error) => {
        const appError = unknownToAppError(error);
        this.emitError({
          ...appError,
          recoverable: false,
        });
        this.eventBus.emitTerminalEvent(job, "failed");
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
    this.nativeScanOrchestrator.sendControl(scanId, "pause");
    this.eventBus.emitProgressBatch(job, "paused", true);
    return { ok: true };
  }

  resumeScan(scanId: string): ScanResumeResponse {
    const job = this.jobs.get(scanId);
    if (!job || job.completed || job.cancelled) {
      return { ok: false };
    }

    job.paused = false;
    this.nativeScanOrchestrator.sendControl(scanId, "resume");
    this.eventBus.emitProgressBatch(job, "walking", true);
    return { ok: true };
  }

  cancelScan(scanId: string): boolean {
    const job = this.jobs.get(scanId);
    if (!job || job.completed) {
      return false;
    }

    job.cancelled = true;
    this.nativeScanOrchestrator.sendControl(scanId, "cancel");
    return true;
  }

  emitError(error: AppError): void {
    this.eventBus.emitError(error);
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
    return await this.portableScanService.run(job);
  }

  private async runNativeScan(job: ScanJob): Promise<ScanTerminalStatus> {
    job.engine = "native";
    job.scanStage = "quick";

    try {
      const quickStartedAt = Date.now();
      job.stageStartedAt = quickStartedAt;
      const quickMaxDepth = isFilesystemRoot(job.rootPath, os.platform())
        ? NATIVE_QUICK_ROOT_MAX_DEPTH
        : NATIVE_QUICK_DEFAULT_MAX_DEPTH;

      await this.nativeScanOrchestrator.runStage(
        this.toNativeStageContext(job),
        {
          mode: "quick",
          maxDepth: quickMaxDepth,
          timeBudgetMs: Math.max(500, job.options.quickBudgetMs),
        },
        this.createNativeStageHandlers(job, quickStartedAt),
      );

      if (!job.quickReadyEmitted) {
        this.eventBus.emitQuickReady(job, quickStartedAt);
      }

      if (!job.cancelled) {
        await sleep(DEEP_START_GRACE_MS);
      }

      if (!job.cancelled) {
        job.scanStage = "deep";
        const deepStartedAt = Date.now();
        job.stageStartedAt = deepStartedAt;
        this.eventBus.emitProgressBatch(job, "walking", true);
        this.eventBus.emitDiagnostics(job, "walking", 0, true);

        const deepBudgetMs = job.options.deepBudgetMs;

        const deepResult = await this.nativeScanOrchestrator.runStage(
          this.toNativeStageContext(job),
          {
            mode: "deep",
            maxDepth: NATIVE_DEEP_MAX_DEPTH,
            timeBudgetMs: deepBudgetMs,
          },
          this.createNativeStageHandlers(job, deepStartedAt),
        );

        if (!job.cancelled) {
          job.estimatedResult = deepResult.estimated;
        }
      }

      if (job.cancelled) {
        this.scanPolicyService.emitRecoverableError(
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
      this.scanPolicyService.persistScanCache(job);
      job.completed = true;
      return job.cancelled ? "canceled" : "done";
    } finally {
      this.nativeScanOrchestrator.dispose(job.scanId);
    }
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

  private createNativeStageHandlers(
    job: ScanJob,
    stageStartedAt: number,
  ): NativeStageHandlers {
    let queueDepth = 0;

    return {
      onAgg: (message) => {
        job.currentPath = message.path;
        this.markVisibleNonRemovableRoot(job, message.path);
        if (message.countDelta > 0) {
          this.scanPolicyService.recordFileObservation(
            job,
            message.path,
            message.sizeDelta,
          );
        } else if (message.sizeDelta > 0) {
          this.scanPolicyService.recordEstimatedDirectory(
            job,
            message.path,
            message.sizeDelta,
          );
        }
        this.eventBus.emitProgressBatch(job, "walking", false);
      },
      onAggBatch: (message) => {
        let lastPath: string | null = null;
        for (const item of message.items) {
          lastPath = item.path;
          this.markVisibleNonRemovableRoot(job, item.path);
          if (item.countDelta > 0) {
            this.scanPolicyService.recordFileObservation(
              job,
              item.path,
              item.sizeDelta,
            );
            continue;
          }

          if (item.sizeDelta > 0) {
            this.scanPolicyService.recordEstimatedDirectory(
              job,
              item.path,
              item.sizeDelta,
            );
          }
        }
        if (lastPath) {
          job.currentPath = lastPath;
        }
        this.eventBus.emitProgressBatch(job, "walking", false);
      },
      onProgress: (message) => {
        job.scannedCount = Math.max(job.scannedCount, message.scannedCount);
        queueDepth = message.queuedDirs;
        if (message.currentPath) {
          this.scanPolicyService.syncExactTraversal(job, message.currentPath);
          job.currentPath = message.currentPath;
          this.markVisibleNonRemovableRoot(job, message.currentPath);
        }
        this.eventBus.emitProgressBatch(job, "walking", false);
        this.eventBus.emitDiagnostics(job, "walking", queueDepth, false);
      },
      onCoverage: (message) => {
        job.blockedByPolicyCount = Math.max(
          job.blockedByPolicyCount,
          message.blockedByPolicy,
        );
        job.blockedByPermissionCount = Math.max(
          job.blockedByPermissionCount,
          message.blockedByPermission,
        );
        job.skippedByScopeCount = Math.max(
          job.skippedByScopeCount,
          message.skippedByScope,
        );
        job.elevationRequired =
          job.elevationRequired || Boolean(message.elevationRequired);
        this.eventBus.emitCoverageUpdate(job, true);
      },
      onDiagnostics: (message) => {
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
      },
      onElevationRequired: (message) => {
        job.elevationRequired = true;
        this.scanPolicyService.emitElevationRequired(job, message.targetPath, message.reason);
        this.eventBus.emitCoverageUpdate(job, true);
      },
      onQuickReady: (message) => {
        this.emitQuickReadyFromNative(job, message, stageStartedAt);
      },
      onWarn: (message) => {
        this.scanPolicyService.emitRecoverableError(
          job,
          toNativeScannerError(job.scanId, message),
        );
      },
      onDone: () => {
        this.eventBus.emitProgressBatch(job, "walking", true);
        this.eventBus.emitDiagnostics(job, "walking", queueDepth, true);
      },
    };
  }

  private toNativeStageContext(job: ScanJob): NativeStageContext {
    return {
      scanId: job.scanId,
      rootPath: job.rootPath,
      permissionDeniedRoots: job.deniedPermissionRoots,
      paused: job.paused,
      cancelled: job.cancelled,
      options: job.options,
    };
  }

  private readonly activeStatTasks = new WeakMap<ScanJob, Set<Promise<void>>>();

  private markVisibleNonRemovableRoot(job: ScanJob, targetPath: string): void {
    for (const root of job.nonRemovableRoots) {
      if (targetPath === root || targetPath.startsWith(`${root}/`)) {
        job.visibleNonRemovableRoots.add(root);
      }
    }
  }

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

  private hasPendingStatTasks(job: ScanJob): boolean {
    const tasks = this.activeStatTasks.get(job);
    return Boolean(tasks && tasks.size > 0);
  }

  private async waitForNextStatTask(job: ScanJob): Promise<void> {
    const tasks = this.activeStatTasks.get(job);
    if (!tasks || tasks.size === 0) {
      return;
    }

    await Promise.race(tasks);
  }

  private async waitWhilePaused(job: ScanJob): Promise<void> {
    while (job.paused && !job.cancelled) {
      this.eventBus.emitProgressBatch(job, "paused", false);
      await sleep(80);
    }
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
