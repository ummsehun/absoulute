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
    expect(report.evidence).toEqual([
      {
        key: "designated-requirement",
        reason: "designated-requirement-missing",
        status: "fail",
      },
      {
        key: "fda-validation-matrix",
        reason: "fda-validation-matrix-missing",
        status: "fail",
      },
      {
        key: "service-management",
        reason: "service-management-not-registered:not-installed",
        status: "fail",
      },
      {
        key: "team-id",
        reason: "team-id-missing",
        status: "fail",
      },
    ]);
  });

  it("reports packaging and helper executable blocker evidence explicitly", () => {
    const report = buildHelperReadinessReport({
      registrationPreflight: {
        status: "blocked",
        blockers: [
          "packaging-entitlements-missing",
          "privileged-helper-executable-missing",
          "privileged-helper-listener-requirement-missing",
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
      fdaMatrixStatus: "ready",
      serviceManagementStatus: "unknown",
    });

    expect(report.evidence).toEqual([
      {
        key: "listener-requirement",
        reason: "privileged-helper-listener-requirement-missing",
        status: "fail",
      },
      {
        key: "packaging-entitlements",
        reason: "packaging-entitlements-missing",
        status: "fail",
      },
      {
        key: "privileged-helper-executable",
        reason: "privileged-helper-executable-missing",
        status: "fail",
      },
      {
        key: "service-management",
        reason: "service-management-not-registered:unknown",
        status: "fail",
      },
    ]);
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
    expect(report.evidence).toEqual([
      {
        key: "service-management",
        reason: "registered",
        status: "pass",
      },
    ]);
  });
});
