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
        guidance: {
          description: expect.any(String),
          requiredInputs: ["SCAN_HELPER_DESIGNATED_REQUIREMENT"],
        },
        reason: "designated-requirement-missing",
        status: "fail",
      },
      {
        key: "fda-validation-matrix",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["docs/helper-fda-validation-matrix.json"],
          requiredInputs: ["SCAN_HELPER_FDA_VALIDATION_MATRIX_READY"],
        },
        reason: "fda-validation-matrix-missing",
        status: "fail",
      },
      {
        key: "service-management",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/service-management-probe-macos"],
          requiredInputs: ["SCAN_HELPER_SM_PROBE_BIN"],
        },
        reason: "service-management-not-registered:not-installed",
        status: "fail",
      },
      {
        key: "team-id",
        guidance: {
          description: expect.any(String),
          requiredInputs: ["SCAN_HELPER_TEAM_ID"],
        },
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
        guidance: {
          description: expect.any(String),
          requiredArtifacts: [
            "resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper.requirement.json",
          ],
        },
        reason: "privileged-helper-listener-requirement-missing",
        status: "fail",
      },
      {
        key: "packaging-entitlements",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: [
            "electron-builder.json",
            "resources/entitlements/mac.plist",
            "resources/entitlements/mac.inherit.plist",
          ],
          requiredInputs: ["SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY"],
        },
        reason: "packaging-entitlements-missing",
        status: "fail",
      },
      {
        key: "privileged-helper-executable",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: [
            "resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper",
          ],
          requiredInputs: ["SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY"],
        },
        reason: "privileged-helper-executable-missing",
        status: "fail",
      },
      {
        key: "service-management",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/service-management-probe-macos"],
          requiredInputs: ["SCAN_HELPER_SM_PROBE_BIN"],
        },
        reason: "service-management-not-registered:unknown",
        status: "fail",
      },
    ]);
  });

  it("reports XPC enumerate bridge blocker evidence explicitly", () => {
    const report = buildHelperReadinessReport({
      registrationPreflight: {
        status: "blocked",
        blockers: ["helper-xpc-enumerate-bridge-missing"],
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

    expect(report.status).toBe("blocked");
    expect(report.evidence).toEqual([
      {
        key: "service-management",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/service-management-probe-macos"],
          requiredInputs: ["SCAN_HELPER_SM_PROBE_BIN"],
        },
        reason: "registered",
        status: "pass",
      },
      {
        key: "xpc-enumerate-bridge",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/helper-xpc-enumerate-macos"],
          requiredInputs: ["SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY"],
        },
        reason: "helper-xpc-enumerate-bridge-missing",
        status: "fail",
      },
    ]);
  });

  it("distinguishes artifact, confirmation, and effective evidence state", () => {
    const report = buildHelperReadinessReport({
      preflightEvidence: {
        artifactEvidence: {
          designatedRequirement: false,
          fdaValidationMatrix: false,
          helperXpcEnumerateBridge: true,
          packagingEntitlements: true,
          privilegedHelperExecutable: true,
          privilegedHelperListenerRequirement: false,
          teamId: false,
        },
        confirmations: {
          designatedRequirement: false,
          fdaValidationMatrix: false,
          helperXpcEnumerateBridge: false,
          packagingEntitlements: false,
          privilegedHelperExecutable: false,
          privilegedHelperListenerRequirement: false,
          teamId: false,
        },
        effectiveEvidence: {
          designatedRequirement: false,
          fdaValidationMatrix: false,
          helperXpcEnumerateBridge: false,
          packagingEntitlements: false,
          privilegedHelperExecutable: false,
          privilegedHelperListenerRequirement: false,
          teamId: false,
        },
      },
      registrationPreflight: {
        status: "blocked",
        blockers: ["helper-xpc-enumerate-bridge-missing"],
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

    expect(report.status).toBe("blocked");
    expect(report.canEnableHelperByDefault).toBe(false);
    expect(report.evidence).toContainEqual(expect.objectContaining({
      artifactReady: true,
      confirmationReady: false,
      effectiveReady: false,
      key: "xpc-enumerate-bridge",
      reason: "xpc-enumerate-bridge-confirmation-missing",
      status: "fail",
    }));
  });

  it("reports confirmation-missing reasons when artifacts are present but confirmations are absent", () => {
    const report = buildHelperReadinessReport({
      preflightEvidence: {
        artifactEvidence: {
          designatedRequirement: false,
          fdaValidationMatrix: true,
          helperXpcEnumerateBridge: true,
          packagingEntitlements: true,
          privilegedHelperExecutable: true,
          privilegedHelperListenerRequirement: false,
          teamId: false,
        },
        confirmations: {
          designatedRequirement: false,
          fdaValidationMatrix: false,
          helperXpcEnumerateBridge: false,
          packagingEntitlements: false,
          privilegedHelperExecutable: false,
          privilegedHelperListenerRequirement: false,
          teamId: false,
        },
        effectiveEvidence: {
          designatedRequirement: false,
          fdaValidationMatrix: false,
          helperXpcEnumerateBridge: false,
          packagingEntitlements: false,
          privilegedHelperExecutable: false,
          privilegedHelperListenerRequirement: false,
          teamId: false,
        },
      },
      registrationPreflight: {
        status: "blocked",
        blockers: [
          "packaging-entitlements-missing",
          "privileged-helper-executable-missing",
          "helper-xpc-enumerate-bridge-missing",
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
      serviceManagementStatus: "registered",
    });

    expect(report.blockers).toEqual([
      "fda-validation-matrix-missing",
      "helper-xpc-enumerate-bridge-missing",
      "packaging-entitlements-missing",
      "privileged-helper-executable-missing",
    ]);
    expect(report.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifactReady: true,
        confirmationReady: false,
        effectiveReady: false,
        key: "fda-validation-matrix",
        reason: "fda-validation-matrix-confirmation-missing",
      }),
      expect.objectContaining({
        artifactReady: true,
        confirmationReady: false,
        effectiveReady: false,
        key: "packaging-entitlements",
        reason: "packaging-entitlements-confirmation-missing",
      }),
      expect.objectContaining({
        artifactReady: true,
        confirmationReady: false,
        effectiveReady: false,
        key: "privileged-helper-executable",
        reason: "privileged-helper-executable-confirmation-missing",
      }),
      expect.objectContaining({
        artifactReady: true,
        confirmationReady: false,
        effectiveReady: false,
        key: "xpc-enumerate-bridge",
        reason: "xpc-enumerate-bridge-confirmation-missing",
      }),
    ]));
  });

  it("reports effective-evidence-missing when artifact and confirmation are present but the gate is false", () => {
    const report = buildHelperReadinessReport({
      preflightEvidence: {
        artifactEvidence: {
          designatedRequirement: false,
          fdaValidationMatrix: false,
          helperXpcEnumerateBridge: true,
          packagingEntitlements: false,
          privilegedHelperExecutable: false,
          privilegedHelperListenerRequirement: false,
          teamId: false,
        },
        confirmations: {
          designatedRequirement: false,
          fdaValidationMatrix: false,
          helperXpcEnumerateBridge: true,
          packagingEntitlements: false,
          privilegedHelperExecutable: false,
          privilegedHelperListenerRequirement: false,
          teamId: false,
        },
        effectiveEvidence: {
          designatedRequirement: false,
          fdaValidationMatrix: false,
          helperXpcEnumerateBridge: false,
          packagingEntitlements: false,
          privilegedHelperExecutable: false,
          privilegedHelperListenerRequirement: false,
          teamId: false,
        },
      },
      registrationPreflight: {
        status: "blocked",
        blockers: ["helper-xpc-enumerate-bridge-missing"],
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

    expect(report.evidence).toContainEqual(expect.objectContaining({
      artifactReady: true,
      confirmationReady: true,
      effectiveReady: false,
      key: "xpc-enumerate-bridge",
      reason: "xpc-enumerate-bridge-effective-evidence-missing",
      status: "fail",
    }));
  });

  it("keeps default helper enablement false even when readiness evidence is present", () => {
    const report = buildHelperReadinessReport({
      preflightEvidence: {
        artifactEvidence: {
          designatedRequirement: true,
          fdaValidationMatrix: true,
          helperXpcEnumerateBridge: true,
          packagingEntitlements: true,
          privilegedHelperExecutable: true,
          privilegedHelperListenerRequirement: true,
          teamId: true,
        },
        confirmations: {
          designatedRequirement: true,
          fdaValidationMatrix: true,
          helperXpcEnumerateBridge: true,
          packagingEntitlements: true,
          privilegedHelperExecutable: true,
          privilegedHelperListenerRequirement: true,
          teamId: true,
        },
        effectiveEvidence: {
          designatedRequirement: true,
          fdaValidationMatrix: true,
          helperXpcEnumerateBridge: true,
          packagingEntitlements: true,
          privilegedHelperExecutable: true,
          privilegedHelperListenerRequirement: true,
          teamId: true,
        },
      },
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
        artifactReady: true,
        confirmationReady: true,
        effectiveReady: true,
        key: "designated-requirement",
        guidance: {
          description: expect.any(String),
          requiredInputs: ["SCAN_HELPER_DESIGNATED_REQUIREMENT"],
        },
        reason: "ready",
        status: "pass",
      },
      {
        artifactReady: true,
        confirmationReady: true,
        effectiveReady: true,
        key: "fda-validation-matrix",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["docs/helper-fda-validation-matrix.json"],
          requiredInputs: ["SCAN_HELPER_FDA_VALIDATION_MATRIX_READY"],
        },
        reason: "ready",
        status: "pass",
      },
      {
        artifactReady: true,
        confirmationReady: true,
        effectiveReady: true,
        key: "listener-requirement",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: [
            "resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper.requirement.json",
          ],
        },
        reason: "ready",
        status: "pass",
      },
      {
        artifactReady: true,
        confirmationReady: true,
        effectiveReady: true,
        key: "packaging-entitlements",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: [
            "electron-builder.json",
            "resources/entitlements/mac.plist",
            "resources/entitlements/mac.inherit.plist",
          ],
          requiredInputs: ["SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY"],
        },
        reason: "ready",
        status: "pass",
      },
      {
        artifactReady: true,
        confirmationReady: true,
        effectiveReady: true,
        key: "privileged-helper-executable",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: [
            "resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper",
          ],
          requiredInputs: ["SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY"],
        },
        reason: "ready",
        status: "pass",
      },
      {
        key: "service-management",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/service-management-probe-macos"],
          requiredInputs: ["SCAN_HELPER_SM_PROBE_BIN"],
        },
        reason: "registered",
        status: "pass",
      },
      {
        artifactReady: true,
        confirmationReady: true,
        effectiveReady: true,
        key: "team-id",
        guidance: {
          description: expect.any(String),
          requiredInputs: ["SCAN_HELPER_TEAM_ID"],
        },
        reason: "ready",
        status: "pass",
      },
      {
        artifactReady: true,
        confirmationReady: true,
        effectiveReady: true,
        key: "xpc-enumerate-bridge",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/helper-xpc-enumerate-macos"],
          requiredInputs: ["SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY"],
        },
        reason: "ready",
        status: "pass",
      },
    ]);
  });

  it("keeps pending ServiceManagement approval blocked", () => {
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
      serviceManagementStatus: "pending-approval",
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toEqual(["service-management-not-registered"]);
    expect(report.evidence).toEqual([
      {
        key: "service-management",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/service-management-probe-macos"],
          requiredInputs: ["SCAN_HELPER_SM_PROBE_BIN"],
        },
        reason: "service-management-not-registered:pending-approval",
        status: "fail",
      },
    ]);
  });

  it("keeps missing ServiceManagement probe implementation blocked", () => {
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
      serviceManagementStatus: "not-implemented",
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toEqual(["service-management-not-registered"]);
    expect(report.evidence).toEqual([
      {
        key: "service-management",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/service-management-probe-macos"],
          requiredInputs: ["SCAN_HELPER_SM_PROBE_BIN"],
        },
        reason: "service-management-not-registered:not-implemented",
        status: "fail",
      },
    ]);
  });

  it("keeps unknown ServiceManagement status blocked when other evidence is ready", () => {
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
      serviceManagementStatus: "unknown",
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toEqual(["service-management-not-registered"]);
    expect(report.evidence).toEqual([
      {
        key: "service-management",
        guidance: {
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/service-management-probe-macos"],
          requiredInputs: ["SCAN_HELPER_SM_PROBE_BIN"],
        },
        reason: "service-management-not-registered:unknown",
        status: "fail",
      },
    ]);
  });
});
