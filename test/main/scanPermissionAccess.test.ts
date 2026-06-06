/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { createPathPolicyClassifier } from "../../src/main/core/securityPolicy";
import {
  applyEffectivePathAccess,
} from "../../src/main/services/scan/scanPermissionAccess";
import type { ScanJob } from "../../src/main/services/scan/scanSessionTypes";

describe("scanPermissionAccess", () => {
  it("updates denied roots, classifier, and pending rescan roots after permission grant", () => {
    const job = {
      rootPath: "/Users/tester",
      deniedPermissionRoots: ["/Users/tester/Documents"],
      nonRemovableRoots: [],
      pendingPermissionRescanRoots: new Set<string>(),
      elevationRequired: true,
      blockedByPermissionCount: 1,
      permissionErrorCount: 1,
      pathClassifier: createPathPolicyClassifier("darwin", "/Users/tester"),
    } as unknown as ScanJob;

    const result = applyEffectivePathAccess(
      job,
      {
        grantedPermissionRoots: ["/Users/tester/Documents"],
        deniedPermissionRoots: [],
        nonRemovableRoots: ["/System"],
        scanBlockedRoots: ["/dev", "/net"],
      },
      "darwin",
      "/Users/tester",
    );

    expect(result.removedDeniedRoots).toEqual(["/Users/tester/Documents"]);
    expect(job.deniedPermissionRoots).toEqual([]);
    expect(job.nonRemovableRoots).toEqual(["/System"]);
    expect(job.pendingPermissionRescanRoots.has("/Users/tester/Documents")).toBe(true);
    expect(job.elevationRequired).toBe(false);
    expect(job.blockedByPermissionCount).toBe(0);
    expect(job.permissionErrorCount).toBe(0);

    const decision = job.pathClassifier("/Users/tester/Documents/report.pdf", false);
    expect(decision.scanAllowed).toBe(true);
    expect(decision.permissionState).toBe("granted");
  });
});
