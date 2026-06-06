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

export const HELPER_TEAM_ID_ENV = "SCAN_HELPER_TEAM_ID";
export const HELPER_DESIGNATED_REQUIREMENT_ENV =
  "SCAN_HELPER_DESIGNATED_REQUIREMENT";
export const HELPER_PACKAGING_ENTITLEMENTS_READY_ENV =
  "SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY";
export const HELPER_FDA_VALIDATION_MATRIX_READY_ENV =
  "SCAN_HELPER_FDA_VALIDATION_MATRIX_READY";

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

export function resolveHelperRegistrationPreflightInputFromEnv(
  env: NodeJS.ProcessEnv,
): HelperRegistrationPreflightInput {
  return {
    identity: {
      teamId: readNonEmptyEnv(env[HELPER_TEAM_ID_ENV]),
      designatedRequirement: readNonEmptyEnv(
        env[HELPER_DESIGNATED_REQUIREMENT_ENV],
      ),
    },
    packagingEntitlementsReady: readBooleanEvidenceEnv(
      env[HELPER_PACKAGING_ENTITLEMENTS_READY_ENV],
    ),
    fdaValidationMatrixReady: readBooleanEvidenceEnv(
      env[HELPER_FDA_VALIDATION_MATRIX_READY_ENV],
    ),
  };
}

function readNonEmptyEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readBooleanEvidenceEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}
