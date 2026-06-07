/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import { runPermissionRescanStages } from "../../src/main/services/scan/nativePermissionRescanRunner";
import { createScanJob } from "../../src/main/services/scan/scanJobFactory";
import type { PathPolicyDecision } from "../../src/main/core/securityPolicy";
import type { NativeStageContext } from "../../src/main/services/scan/nativeScanOrchestrator";

const rootDecision: PathPolicyDecision = {
  scanAllowed: true,
  removeAllowed: true,
  normalizedPath: "/Users/tester",
  permissionState: "not_required",
  effectiveAccess: {
    deniedPermissionRoots: [],
    grantedPermissionRoots: [],
    nonRemovableRoots: [],
    scanBlockedRoots: [],
  },
};

function makeJob() {
  return createScanJob({
    homeDirectory: "/Users/tester",
    input: {
      rootPath: "/Users/tester",
      optInProtected: false,
    },
    lastEmitAt: 1000,
    platform: "darwin",
    rootDecision,
    rootDeviceId: null,
    scanId: "scan-1",
    startedAt: 1000,
    topLimitPerDirectory: 200,
  });
}

describe("nativePermissionRescanRunner", () => {
  it("does nothing when there are no pending permission roots", async () => {
    const runStage = vi.fn();
    const job = makeJob();

    await runPermissionRescanStages({
      createNativeStageHandlers: vi.fn(),
      eventBus: {
        emitDiagnostics: vi.fn(),
        emitProgressBatch: vi.fn(),
      },
      job,
      maxDepth: 128,
      nativeScanOrchestrator: { runStage },
      toNativeStageContext: vi.fn(),
    });

    expect(runStage).not.toHaveBeenCalled();
  });

  it("runs pending permission roots and records completion", async () => {
    const job = makeJob();
    job.pendingPermissionRescanRoots.add("/Users/tester/Library/Mail");
    const contextForRoot = vi.fn(
      (_job, rootPath): NativeStageContext => ({
        cancelled: false,
        options: job.options,
        paused: false,
        permissionDeniedRoots: [],
        rootPath,
        scanId: job.scanId,
      }),
    );
    const runStage = vi.fn().mockResolvedValue({ estimated: true });
    const handlers = {
      onAgg: vi.fn(),
      onAggBatch: vi.fn(),
      onCoverage: vi.fn(),
      onDiagnostics: vi.fn(),
      onDone: vi.fn(),
      onElevationRequired: vi.fn(),
      onProgress: vi.fn(),
      onQuickReady: vi.fn(),
      onWarn: vi.fn(),
    };

    await runPermissionRescanStages({
      createNativeStageHandlers: vi.fn(() => handlers),
      eventBus: {
        emitDiagnostics: vi.fn(),
        emitProgressBatch: vi.fn(),
      },
      job,
      maxDepth: 128,
      nativeScanOrchestrator: { runStage },
      toNativeStageContext: contextForRoot,
    });

    expect(contextForRoot).toHaveBeenCalledWith(job, "/Users/tester/Library/Mail");
    expect(runStage).toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: "/Users/tester/Library/Mail" }),
      {
        mode: "deep",
        maxDepth: 128,
        timeBudgetMs: job.options.deepBudgetMs,
      },
      handlers,
    );
    expect(job.pendingPermissionRescanRoots.size).toBe(0);
    expect(job.completedPermissionRescanRoots).toEqual([
      "/Users/tester/Library/Mail",
    ]);
    expect(job.activePermissionRescanRoot).toBeUndefined();
    expect(job.estimatedResult).toBe(true);
  });
});
