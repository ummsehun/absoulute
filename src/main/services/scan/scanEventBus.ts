import type {
  AggDelta,
  AppError,
  ScanConfidence,
  ScanCoverage,
  ScanCoverageUpdate,
  ScanDiagnostics,
  ScanElevationPolicy,
  ScanElevationRequired,
  ScanEngine,
  ScanPerfSample,
  ScanProgress,
  ScanProgressBatch,
  ScanQuickReady,
  ScanTerminalEvent,
  ScanTerminalStatus,
} from "../../../types/contracts";
import {
  buildQuickReadyPayload,
  buildScanDiagnostics,
  inferQuickConfidence,
} from "../diagnostics/scanDiagnostics";
import { detectCpuHintFromPlatform } from "../native/nativeRustScannerClient";

const COVERAGE_INTERVAL_MS = 300;
const DELTA_BATCH_LIMIT = 1024;
const DIAGNOSTICS_INTERVAL_MS = 700;

type ScanStage = Exclude<ScanProgress["scanStage"], undefined>;

interface ScanProgressLike {
  currentPath: string;
  estimatedResult: boolean;
  quickReadyEmitted: boolean;
  scanId: string;
  scannedCount: number;
  scanStage: ScanStage;
  totalBytes: number;
}

export interface ScanEventJob extends ScanProgressLike {
  aggregator: {
    consumePatch: () => ScanProgressBatch["patches"][number] | null | undefined;
  };
  blockedByPermissionCount: number;
  blockedByPolicyCount: number;
  deferredByBudgetCount: number;
  diagnosticsLastEmitAt: number;
  elevationRequired: boolean;
  emittedErrorCount: number;
  engine: ScanEngine;
  estimatedDirectories: ReadonlySet<string>;
  fallbackReason?: string;
  inflightCount: number;
  ioErrorCount: number;
  lastCoverageEmitAt: number;
  lastEmitAt: number;
  options: {
    elevationPolicy: ScanElevationPolicy;
    emitPolicy: {
      progressIntervalMs: number;
    };
  };
  pendingDeltaEventCount: number;
  pendingDeltaMap: Map<string, AggDelta>;
  permissionErrorCount: number;
  rootPath: string;
  softSkippedByPolicyCount: number;
  stageStartedAt: number;
  startedAt: number;
}

export class ScanEventBus {
  private readonly coverageListeners = new Set<(event: ScanCoverageUpdate) => void>();
  private readonly diagnosticsListeners = new Set<(event: ScanDiagnostics) => void>();
  private readonly elevationRequiredListeners = new Set<
    (event: ScanElevationRequired) => void
  >();
  private readonly errorListeners = new Set<(error: AppError) => void>();
  private readonly perfSampleListeners = new Set<(event: ScanPerfSample) => void>();
  private readonly progressListeners = new Set<(batch: ScanProgressBatch) => void>();
  private readonly quickReadyListeners = new Set<(event: ScanQuickReady) => void>();
  private readonly terminalListeners = new Set<(event: ScanTerminalEvent) => void>();

  onCoverage(listener: (event: ScanCoverageUpdate) => void): () => void {
    this.coverageListeners.add(listener);
    return () => this.coverageListeners.delete(listener);
  }

  onDiagnostics(listener: (event: ScanDiagnostics) => void): () => void {
    this.diagnosticsListeners.add(listener);
    return () => this.diagnosticsListeners.delete(listener);
  }

  onElevationRequired(listener: (event: ScanElevationRequired) => void): () => void {
    this.elevationRequiredListeners.add(listener);
    return () => this.elevationRequiredListeners.delete(listener);
  }

  onError(listener: (error: AppError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onPerfSample(listener: (event: ScanPerfSample) => void): () => void {
    this.perfSampleListeners.add(listener);
    return () => this.perfSampleListeners.delete(listener);
  }

  onProgress(listener: (batch: ScanProgressBatch) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  onQuickReady(listener: (event: ScanQuickReady) => void): () => void {
    this.quickReadyListeners.add(listener);
    return () => this.quickReadyListeners.delete(listener);
  }

  onTerminal(listener: (event: ScanTerminalEvent) => void): () => void {
    this.terminalListeners.add(listener);
    return () => this.terminalListeners.delete(listener);
  }

  appendDeltas(
    job: Pick<ScanEventJob, "pendingDeltaEventCount" | "pendingDeltaMap">,
    deltas: AggDelta[],
  ): void {
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

  emitCoverageUpdate(job: ScanEventJob, force: boolean): void {
    const now = Date.now();
    if (!force && now - job.lastCoverageEmitAt < COVERAGE_INTERVAL_MS) {
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

  emitDiagnostics(
    job: ScanEventJob,
    phase: ScanProgress["phase"],
    queueDepth: number,
    force: boolean,
  ): void {
    const now = Date.now();
    if (!force && now - job.diagnosticsLastEmitAt < DIAGNOSTICS_INTERVAL_MS) {
      return;
    }

    const progress = this.buildProgress(job, phase);
    const elapsedMs = now - job.startedAt;
    const stageElapsedMs = Math.max(0, now - job.stageStartedAt);
    const filesPerSec =
      elapsedMs > 0 ? Number((job.scannedCount / (elapsedMs / 1000)).toFixed(2)) : 0;
    const ioWaitRatio = job.engine === "native" ? 0.35 : 0.55;
    const coverage = this.getCoverage(job);
    const inflightStats = {
      inFlight: Math.max(0, job.inflightCount),
      queuedDirs: Math.max(0, queueDepth),
    };

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
        softSkippedByPolicy: job.softSkippedByPolicyCount,
        deferredByBudget: job.deferredByBudgetCount,
        inflightStats,
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
      softSkippedByPolicy: job.softSkippedByPolicyCount,
      deferredByBudget: job.deferredByBudgetCount,
      inflight: job.inflightCount,
    });
  }

  emitElevationRequired(job: ScanEventJob, targetPath: string, reason: string): void {
    const event: ScanElevationRequired = {
      scanId: job.scanId,
      targetPath,
      reason,
      policy: job.options.elevationPolicy,
    };

    for (const listener of this.elevationRequiredListeners) {
      listener(event);
    }
  }

  emitError(error: AppError): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  emitPerfSample(
    job: ScanEventJob,
    input: {
      deferredByBudget?: number;
      filesPerSec: number;
      hotPath?: string;
      inflight?: number;
      ioWaitRatio: number;
      queueDepth: number;
      softSkippedByPolicy?: number;
      stageElapsedMs: number;
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
      softSkippedByPolicy: input.softSkippedByPolicy ?? job.softSkippedByPolicyCount,
      deferredByBudget: input.deferredByBudget ?? job.deferredByBudgetCount,
      inflightStats: {
        inFlight: Math.max(0, input.inflight ?? job.inflightCount),
        queuedDirs: Math.max(0, input.queueDepth),
      },
    };

    for (const listener of this.perfSampleListeners) {
      listener(sample);
    }
  }

  emitProgressBatch(
    job: ScanEventJob,
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
      progress: this.buildProgress(job, phase),
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

  emitQuickReady(job: ScanEventJob, quickStartedAt: number): void {
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

  emitQuickReadyEvent(event: ScanQuickReady): void {
    for (const listener of this.quickReadyListeners) {
      listener(event);
    }
  }

  emitTerminal(scanId: string, status: ScanTerminalStatus): void {
    const event: ScanTerminalEvent = {
      scanId,
      status,
      finishedAt: Date.now(),
    };

    for (const listener of this.terminalListeners) {
      listener(event);
    }
  }

  private buildProgress(
    job: ScanEventJob,
    phase: ScanProgress["phase"],
  ): ScanProgress {
    return {
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
  }

  private getCoverage(job: Pick<ScanEventJob, "blockedByPermissionCount" | "blockedByPolicyCount" | "elevationRequired" | "scannedCount">): ScanCoverage {
    return {
      scanned: job.scannedCount,
      blockedByPolicy: job.blockedByPolicyCount,
      blockedByPermission: job.blockedByPermissionCount,
      elevationRequired: job.elevationRequired,
    };
  }

  private resolveConfidence(
    job: Pick<ScanEventJob, "ioErrorCount" | "permissionErrorCount" | "rootPath" | "scannedCount">,
  ): ScanConfidence {
    return inferQuickConfidence({
      rootPath: job.rootPath,
      scannedCount: job.scannedCount,
      permissionErrors: job.permissionErrorCount,
      ioErrors: job.ioErrorCount,
    });
  }
}
