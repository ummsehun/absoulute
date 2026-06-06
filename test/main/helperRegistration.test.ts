/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH,
  DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME,
  DISK_SCAN_HELPER_LABEL,
  DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
  getHelperRegistrationContract,
  resolveHelperRegistrationPreflight,
} from "../../src/main/services/helper/helperRegistration";

describe("helperRegistration", () => {
  it("defines the ServiceManagement daemon registration contract", () => {
    expect(getHelperRegistrationContract()).toEqual({
      appBundleIdentifier: DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
      helperLabel: DISK_SCAN_HELPER_LABEL,
      launchDaemonPlistName: DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME,
      launchDaemonBundleRelativePath:
        DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH,
      serviceManagementModel: "smappservice-daemon",
    });

    expect(DISK_SCAN_HELPER_LABEL).toBe(
      "com.example.diskvisualizer.privileged-helper",
    );
    expect(DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH).toBe(
      "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
    );
  });

  it("keeps helper registration blocked until signing, packaging, and FDA gates are explicit", () => {
    expect(resolveHelperRegistrationPreflight()).toEqual({
      contract: getHelperRegistrationContract(),
      status: "blocked",
      blockers: [
        "team-id-missing",
        "designated-requirement-missing",
        "packaging-entitlements-missing",
        "fda-validation-matrix-missing",
      ],
    });
  });

  it("marks the registration preflight ready only when every helper gate has evidence", () => {
    expect(
      resolveHelperRegistrationPreflight({
        identity: {
          teamId: "ABCDE12345",
          designatedRequirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic',
        },
        packagingEntitlementsReady: true,
        fdaValidationMatrixReady: true,
      }),
    ).toEqual({
      contract: getHelperRegistrationContract(),
      status: "ready",
      blockers: [],
    });
  });
});
