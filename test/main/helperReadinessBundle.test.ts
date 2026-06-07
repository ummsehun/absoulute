/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildHelperReadinessBundle } from "../../src/main/services/helper/helperReadinessBundle";
import {
  NotImplementedMacOsServiceManagementProbe,
  type MacOsServiceManagementProbe,
} from "../../src/main/services/helper/macosServiceManagementProbe";

describe("helperReadinessBundle", () => {
  it("bundles blocked helper readiness evidence without changing readiness semantics", async () => {
    const bundle = await buildHelperReadinessBundle({
      env: {},
      platform: "darwin",
      serviceManagementProbe: new NotImplementedMacOsServiceManagementProbe(),
    });

    expect(bundle.status).toBe("blocked");
    expect(bundle.canEnableHelperByDefault).toBe(false);
    expect(bundle.componentStatus).toEqual({
      fdaMatrix: "blocked",
      identity: "blocked",
      preflight: "blocked",
      readiness: "blocked",
      serviceManagement: "blocked",
    });
    expect(bundle.blockers).toContain("team-id-missing");
    expect(bundle.blockers).toContain("fda-validation-matrix-missing");
    expect(bundle.blockers).toContain("service-management-not-registered");
    expect(bundle.identity.status).toBe("blocked");
    expect(bundle.fdaMatrix.status).toBe("blocked");
    expect(bundle.serviceManagement.status).toBe("blocked");
    expect(bundle.preflight.status).toBe("blocked");
    expect(bundle.readiness.status).toBe("blocked");
  });

  it("keeps bundle readiness tied to the readiness report", async () => {
    const bundle = await buildHelperReadinessBundle({
      env: {
        SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY: "true",
        SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY: "true",
        SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY: "true",
      },
      platform: "darwin",
      serviceManagementProbe: new RegisteredTestProbe(),
    });

    expect(bundle.componentStatus.serviceManagement).toBe("ready");
    expect(bundle.status).toBe("blocked");
    expect(bundle.readiness.status).toBe("blocked");
    expect(bundle.blockers).toContain("team-id-missing");
  });
});

class RegisteredTestProbe implements MacOsServiceManagementProbe {
  async getStatus(): Promise<{
    reason: "enabled";
    state: "registered";
  }> {
    return {
      reason: "enabled",
      state: "registered",
    };
  }
}
