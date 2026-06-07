/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildHelperReadinessReport } from "../../src/main/services/helper/helperReadinessAudit";

describe("helper readiness audit", () => {
  it("reports blocked while identity and FDA evidence are missing", () => {
    const report = buildHelperReadinessReport({
      registrationPreflight: {
        status: "blocked",
        blockers: [
          "team-id-missing",
          "designated-requirement-missing",
          "fda-validation-matrix-missing",
        ],
        contract: {
          appBundleIdentifier: "com.example.diskvisualizer",
          helperExecutableBundleRelativePath:
            "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
          helperLabel: "com.example.diskvisualizer.privileged-helper",
          launchDaemonBundleRelativePath:
            "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
          launchDaemonPlistName:
            "com.example.diskvisualizer.privileged-helper.plist",
          serviceManagementModel: "smappservice-daemon",
        },
      },
      fdaMatrixStatus: "blocked",
      serviceManagementStatus: "not-installed",
    });

    expect(report.status).toBe("blocked");
    expect(report.canEnableHelperByDefault).toBe(false);
    expect(report.blockers).toContain("team-id-missing");
    expect(report.blockers).toContain("fda-validation-matrix-missing");
  });

  it("keeps default helper enablement false even when readiness evidence is present", () => {
    const report = buildHelperReadinessReport({
      registrationPreflight: {
        status: "ready",
        blockers: [],
        contract: {
          appBundleIdentifier: "com.example.diskvisualizer",
          helperExecutableBundleRelativePath:
            "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
          helperLabel: "com.example.diskvisualizer.privileged-helper",
          launchDaemonBundleRelativePath:
            "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
          launchDaemonPlistName:
            "com.example.diskvisualizer.privileged-helper.plist",
          serviceManagementModel: "smappservice-daemon",
        },
      },
      fdaMatrixStatus: "ready",
      serviceManagementStatus: "registered",
    });

    expect(report.status).toBe("ready");
    expect(report.canEnableHelperByDefault).toBe(false);
    expect(report.blockers).toEqual([]);
  });
});
