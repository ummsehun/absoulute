/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { createScanJob } from "../../src/main/services/scan/scanJobFactory";
import type { PathPolicyDecision } from "../../src/main/core/securityPolicy";

const rootDecision: PathPolicyDecision = {
  scanAllowed: true,
  removeAllowed: true,
  normalizedPath: "/Users/tester",
  permissionState: "not_required",
  effectiveAccess: {
    deniedPermissionRoots: ["/Users/tester/Library/Mail"],
    grantedPermissionRoots: [],
    nonRemovableRoots: ["/Users/tester/System"],
    scanBlockedRoots: [],
  },
};

describe("scanJobFactory", () => {
  it("creates a native scan job with stable initial counters and access plan", () => {
    const job = createScanJob({
      homeDirectory: "/Users/tester",
      input: {
        rootPath: "/Users/tester",
        optInProtected: false,
      },
      lastEmitAt: 1200,
      platform: "darwin",
      rootDecision,
      rootDeviceId: 42,
      scanId: "scan-1",
      startedAt: 1000,
      topLimitPerDirectory: 200,
    });

    expect(job.scanId).toBe("scan-1");
    expect(job.rootPath).toBe("/Users/tester");
    expect(job.currentPath).toBe("/Users/tester");
    expect(job.cancelled).toBe(false);
    expect(job.paused).toBe(false);
    expect(job.completed).toBe(false);
    expect(job.scannedCount).toBe(0);
    expect(job.totalBytes).toBe(0);
    expect(job.blockedByPolicyCount).toBe(0);
    expect(job.blockedByPermissionCount).toBe(0);
    expect(job.skippedByScopeCount).toBe(0);
    expect(job.rootDeviceId).toBe(42);
    expect(job.deniedPermissionRoots).toEqual(["/Users/tester/Library/Mail"]);
    expect(job.nonRemovableRoots).toEqual(["/Users/tester/System"]);
    expect(job.pendingPermissionRescanRoots.size).toBe(0);
    expect(job.completedPermissionRescanRoots).toEqual([]);
    expect(job.visibleNonRemovableRoots.size).toBe(0);
    expect(job.engine).toBe("native");
    expect(job.scanStage).toBe("quick");
    expect(job.options.scanMode).toBe("native_rust");
    expect(job.aggregator).toBeDefined();
  });

  it("creates a node engine job when scan options request portable mode", () => {
    const job = createScanJob({
      homeDirectory: "/Users/tester",
      input: {
        rootPath: "/Users/tester",
        optInProtected: false,
        scanMode: "portable",
      },
      lastEmitAt: 1200,
      platform: "darwin",
      rootDecision,
      rootDeviceId: null,
      scanId: "scan-portable",
      startedAt: 1000,
      topLimitPerDirectory: 200,
    });

    expect(job.engine).toBe("node");
    expect(job.options.scanMode).toBe("portable");
    expect(job.rootDeviceId).toBeNull();
  });
});
