export type HelperServiceManagementModel = "smappservice-daemon";

export type HelperRegistrationBlocker =
  | "team-id-missing"
  | "designated-requirement-missing"
  | "packaging-entitlements-missing"
  | "fda-validation-matrix-missing";

export interface HelperRegistrationIdentityInput {
  teamId?: string | null;
  designatedRequirement?: string | null;
}

export interface HelperRegistrationPreflightInput {
  identity?: HelperRegistrationIdentityInput;
  packagingEntitlementsReady?: boolean;
  fdaValidationMatrixReady?: boolean;
}

export interface HelperRegistrationContract {
  appBundleIdentifier: string;
  helperLabel: string;
  launchDaemonPlistName: string;
  launchDaemonBundleRelativePath: string;
  serviceManagementModel: HelperServiceManagementModel;
}

export interface HelperRegistrationPreflight {
  contract: HelperRegistrationContract;
  status: "blocked" | "ready";
  blockers: HelperRegistrationBlocker[];
}

export const DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER =
  "com.example.diskvisualizer";

export const DISK_SCAN_HELPER_LABEL =
  `${DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER}.privileged-helper`;

export const DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME =
  `${DISK_SCAN_HELPER_LABEL}.plist`;

export const DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH =
  `Contents/Library/LaunchDaemons/${DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME}`;

export const DISK_SCAN_HELPER_SERVICE_MANAGEMENT_MODEL: HelperServiceManagementModel =
  "smappservice-daemon";

export function getHelperRegistrationContract(): HelperRegistrationContract {
  return {
    appBundleIdentifier: DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
    helperLabel: DISK_SCAN_HELPER_LABEL,
    launchDaemonPlistName: DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME,
    launchDaemonBundleRelativePath:
      DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH,
    serviceManagementModel: DISK_SCAN_HELPER_SERVICE_MANAGEMENT_MODEL,
  };
}

export function resolveHelperRegistrationPreflight(
  input: HelperRegistrationPreflightInput = {},
): HelperRegistrationPreflight {
  const blockers: HelperRegistrationBlocker[] = [];

  if (!input.identity?.teamId) {
    blockers.push("team-id-missing");
  }

  if (!input.identity?.designatedRequirement) {
    blockers.push("designated-requirement-missing");
  }

  if (!input.packagingEntitlementsReady) {
    blockers.push("packaging-entitlements-missing");
  }

  if (!input.fdaValidationMatrixReady) {
    blockers.push("fda-validation-matrix-missing");
  }

  return {
    contract: getHelperRegistrationContract(),
    status: blockers.length > 0 ? "blocked" : "ready",
    blockers,
  };
}
