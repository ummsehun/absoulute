/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import { ScanStatTaskCoordinator } from "../../src/main/services/scan/scanStatTaskCoordinator";
import { createScanJob } from "../../src/main/services/scan/scanJobFactory";
import type { PathPolicyDecision } from "../../src/main/core/securityPolicy";

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

describe("ScanStatTaskCoordinator", () => {
  it("tracks scheduled stat tasks and clears inflight count after flush", async () => {
    const coordinator = new ScanStatTaskCoordinator({
      emitProgressBatch: vi.fn(),
    });
    const job = makeJob();

    await coordinator.schedule(job, async () => {
      await Promise.resolve();
    });

    expect(coordinator.hasPending(job)).toBe(true);
    expect(job.inflightCount).toBe(1);

    await coordinator.flush(job);

    expect(coordinator.hasPending(job)).toBe(false);
    expect(job.inflightCount).toBe(0);
  });

  it("emits paused progress while waiting for resume", async () => {
    const emitProgressBatch = vi.fn();
    const coordinator = new ScanStatTaskCoordinator({ emitProgressBatch });
    const job = makeJob();
    job.paused = true;

    const waiting = coordinator.waitWhilePaused(job, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    job.paused = false;
    await waiting;

    expect(emitProgressBatch).toHaveBeenCalledWith(job, "paused", false);
  });
});
