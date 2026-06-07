/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import { createNativeStageHandlers } from "../../src/main/services/scan/nativeStageHandlers";
import { ScanAggregator } from "../../src/main/services/scanAggregator";
import { resolveScanOptions } from "../../src/main/services/scan/scanRuntimeOptions";
import type { AppError } from "../../src/types/contracts";
import type { ScanJob } from "../../src/main/services/scan/scanSessionTypes";

function makeJob(): ScanJob {
  const startedAt = Date.now();
  return {
    scanId: "scan-1",
    rootPath: "/Users/tester",
    startedAt,
    optInProtected: false,
    cancelled: false,
    paused: false,
    completed: false,
    scannedCount: 0,
    totalBytes: 0,
    currentPath: "/Users/tester",
    lastEmitAt: startedAt,
    pendingDeltaMap: new Map(),
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
    estimatedDirectories: new Set(),
    skippedHeavyDirectories: new Set(),
    deepSkippedByPolicy: false,
    softSkippedByPolicyCount: 0,
    deferredByBudgetCount: 0,
    skipSamples: {},
    inflightCount: 0,
    rootDeviceId: null,
    deniedPermissionRoots: [],
    pendingPermissionRescanRoots: new Set(),
    completedPermissionRescanRoots: [],
    nonRemovableRoots: [],
    visibleNonRemovableRoots: new Set(),
    options: resolveScanOptions(
      {
        rootPath: "/Users/tester",
        optInProtected: false,
      },
      "/Users/tester",
    ),
    engine: "native",
    aggregator: new ScanAggregator("/Users/tester", 200, "darwin"),
    pathClassifier: () =>
      ({
        scanAllowed: true,
        removeAllowed: true,
        normalizedPath: "/Users/tester",
        permissionState: "not_required",
      }) as const,
    scanStage: "deep",
  };
}

describe("nativeStageHandlers", () => {
  it("records aggregate batches and emits progress through dependencies", () => {
    const job = makeJob();
    const recordFileObservation = vi.fn();
    const recordEstimatedDirectory = vi.fn();
    const emitProgressBatch = vi.fn();
    const handlers = createNativeStageHandlers({
      job,
      stageStartedAt: job.stageStartedAt,
      eventBus: {
        emitCoverageUpdate: vi.fn(),
        emitDiagnostics: vi.fn(),
        emitPerfSample: vi.fn(),
        emitProgressBatch,
        emitQuickReadyEvent: vi.fn(),
      },
      scanPolicyService: {
        emitElevationRequired: vi.fn(),
        emitRecoverableError: vi.fn(),
        recordEstimatedDirectory,
        recordFileObservation,
        syncExactTraversal: vi.fn(),
      },
      emitQuickReadyFromNative: vi.fn(),
      markVisibleNonRemovableRoot: vi.fn(),
      toNativeScannerError: () => ({ code: "E_IO", message: "native" }) as AppError,
    });

    handlers.onAggBatch({
      type: "agg_batch",
      items: [
        { path: "/Users/tester/a.txt", sizeDelta: 3, countDelta: 1, estimated: false },
        { path: "/Users/tester/dir", sizeDelta: 9, countDelta: 0, estimated: true },
      ],
    });

    expect(recordFileObservation).toHaveBeenCalledWith(job, "/Users/tester/a.txt", 3);
    expect(recordEstimatedDirectory).toHaveBeenCalledWith(job, "/Users/tester/dir", 9);
    expect(job.currentPath).toBe("/Users/tester/dir");
    expect(emitProgressBatch).toHaveBeenCalledWith(job, "walking", false);
  });

  it("merges coverage and diagnostic counters without lowering existing values", () => {
    const job = makeJob();
    job.blockedByPolicyCount = 5;
    const emitCoverageUpdate = vi.fn();
    const emitPerfSample = vi.fn();
    const handlers = createNativeStageHandlers({
      job,
      stageStartedAt: job.stageStartedAt,
      eventBus: {
        emitCoverageUpdate,
        emitDiagnostics: vi.fn(),
        emitPerfSample,
        emitProgressBatch: vi.fn(),
        emitQuickReadyEvent: vi.fn(),
      },
      scanPolicyService: {
        emitElevationRequired: vi.fn(),
        emitRecoverableError: vi.fn(),
        recordEstimatedDirectory: vi.fn(),
        recordFileObservation: vi.fn(),
        syncExactTraversal: vi.fn(),
      },
      emitQuickReadyFromNative: vi.fn(),
      markVisibleNonRemovableRoot: vi.fn(),
      toNativeScannerError: () => ({ code: "E_IO", message: "native" }) as AppError,
    });

    handlers.onCoverage({
      type: "coverage",
      scanned: 10,
      blockedByPolicy: 2,
      blockedByPermission: 4,
      skippedByScope: 1,
      elevationRequired: true,
    });
    handlers.onDiagnostics({
      type: "diagnostics",
      filesPerSec: 10,
      stageElapsedMs: 20,
      ioWaitRatio: 0.1,
      queueDepth: 3,
      policySkipSamples: ["/policy"],
      permissionSamples: ["/permission"],
      inflight: 2,
    });

    expect(job.blockedByPolicyCount).toBe(5);
    expect(job.blockedByPermissionCount).toBe(4);
    expect(job.elevationRequired).toBe(true);
    expect(job.skipSamples.permission).toEqual(["/permission"]);
    expect(job.inflightCount).toBe(2);
    expect(emitCoverageUpdate).toHaveBeenCalledWith(job, true);
    expect(emitPerfSample).toHaveBeenCalled();
  });
});
