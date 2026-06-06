import fs from "node:fs";
import path from "node:path";

export type HelperServiceManagementModel = "smappservice-daemon";

export type HelperRegistrationBlocker =
  | "team-id-missing"
  | "designated-requirement-missing"
  | "packaging-entitlements-missing"
  | "privileged-helper-executable-missing"
  | "privileged-helper-listener-requirement-missing"
  | "fda-validation-matrix-missing";

export interface HelperRegistrationIdentityInput {
  teamId?: string | null;
  designatedRequirement?: string | null;
}

export interface HelperRegistrationPreflightInput {
  identity?: HelperRegistrationIdentityInput;
  packagingEntitlementsReady?: boolean;
  privilegedHelperExecutableReady?: boolean;
  privilegedHelperListenerRequirementReady?: boolean;
  fdaValidationMatrixReady?: boolean;
}

export interface HelperRegistrationContract {
  appBundleIdentifier: string;
  helperLabel: string;
  helperExecutableBundleRelativePath: string;
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
export const HELPER_PRIVILEGED_EXECUTABLE_READY_ENV =
  "SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY";
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

export const DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH =
  `Contents/Library/LaunchServices/${DISK_SCAN_HELPER_LABEL}`;

export const DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH =
  `resources/helper/LaunchServices/${DISK_SCAN_HELPER_LABEL}`;

export const DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH =
  `${DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH}.requirement.json`;
export const DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH =
  "docs/helper-fda-validation-matrix.json";
export const DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS = [
  "unsigned-dev-app-without-fda",
  "signed-dev-app-without-fda",
  "signed-dev-app-with-fda",
  "installed-helper-without-fda",
  "installed-helper-with-app-fda",
  "installed-helper-with-helper-specific-fda",
] as const;

export const DISK_SCAN_HELPER_SERVICE_MANAGEMENT_MODEL: HelperServiceManagementModel =
  "smappservice-daemon";

export function getHelperRegistrationContract(): HelperRegistrationContract {
  return {
    appBundleIdentifier: DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
    helperLabel: DISK_SCAN_HELPER_LABEL,
    helperExecutableBundleRelativePath:
      DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH,
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
  const teamId = input.identity?.teamId;
  const designatedRequirement = input.identity?.designatedRequirement;

  if (!isValidAppleTeamId(teamId)) {
    blockers.push("team-id-missing");
  }

  if (!isValidDesignatedRequirement(designatedRequirement, teamId)) {
    blockers.push("designated-requirement-missing");
  }

  if (!input.packagingEntitlementsReady) {
    blockers.push("packaging-entitlements-missing");
  }

  if (!input.privilegedHelperExecutableReady) {
    blockers.push("privileged-helper-executable-missing");
  }

  if (!input.privilegedHelperListenerRequirementReady) {
    blockers.push("privileged-helper-listener-requirement-missing");
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

export function buildHelperCodeSigningRequirement(teamId: string): string {
  if (!isValidAppleTeamId(teamId)) {
    throw new Error("helper code signing requirement needs a valid Apple Team ID");
  }

  return `identifier "${DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER}" and anchor apple generic and certificate leaf[subject.OU] = "${teamId}"`;
}

export function resolveHelperRegistrationPreflightInputFromEnv(
  env: NodeJS.ProcessEnv,
  projectRoot = process.cwd(),
): HelperRegistrationPreflightInput {
  const teamId = readNonEmptyEnv(env[HELPER_TEAM_ID_ENV]);
  const designatedRequirement = readNonEmptyEnv(
    env[HELPER_DESIGNATED_REQUIREMENT_ENV],
  );

  return {
    identity: buildIdentityInput(teamId, designatedRequirement),
    packagingEntitlementsReady: readBooleanEvidenceEnv(
      env[HELPER_PACKAGING_ENTITLEMENTS_READY_ENV],
    ) && resolvePackagingEntitlementsEvidence(projectRoot),
    privilegedHelperExecutableReady: readBooleanEvidenceEnv(
      env[HELPER_PRIVILEGED_EXECUTABLE_READY_ENV],
    ) && resolvePrivilegedHelperExecutableEvidence(projectRoot),
    privilegedHelperListenerRequirementReady:
      resolvePrivilegedHelperListenerRequirementEvidence(projectRoot, teamId),
    fdaValidationMatrixReady: readBooleanEvidenceEnv(
      env[HELPER_FDA_VALIDATION_MATRIX_READY_ENV],
    ) && resolveFdaValidationMatrixEvidence(projectRoot),
  };
}

export function resolvePackagingEntitlementsEvidence(
  projectRoot = process.cwd(),
): boolean {
  return fs.existsSync(path.join(projectRoot, "resources", "entitlements", "mac.plist"))
    && fs.existsSync(
      path.join(projectRoot, "resources", "entitlements", "mac.inherit.plist"),
    );
}

export function resolvePrivilegedHelperExecutableEvidence(
  projectRoot = process.cwd(),
): boolean {
  const executablePath = path.join(
    projectRoot,
    DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  );

  try {
    const stat = fs.statSync(executablePath);
    return stat.isFile()
      && (stat.mode & 0o111) !== 0
      && hasMachOHeader(executablePath)
      && resolvePrivilegedHelperExecutablePackagingEvidence(projectRoot);
  } catch {
    return false;
  }
}

export function resolvePrivilegedHelperListenerRequirementEvidence(
  projectRoot = process.cwd(),
  teamId?: string | null,
): boolean {
  if (!isValidAppleTeamId(teamId)) {
    return false;
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(
      path.join(
        projectRoot,
        DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
      ),
      "utf8",
    )) as {
      ready?: boolean;
      requirement?: string;
      teamId?: string;
    };
    const expectedRequirement = buildHelperCodeSigningRequirement(teamId);
    return metadata.ready === true
      && metadata.teamId === teamId
      && metadata.requirement === expectedRequirement;
  } catch {
    return false;
  }
}

export function resolveFdaValidationMatrixEvidence(
  projectRoot = process.cwd(),
): boolean {
  try {
    const matrix = JSON.parse(fs.readFileSync(
      path.join(projectRoot, DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH),
      "utf8",
    )) as {
      scenarios?: Array<{
        id?: string;
        notes?: string;
        status?: string;
        validatedAt?: string;
        validator?: string;
      }>;
      targetMacOS?: string;
    };

    if (!isConcreteMacOsVersion(matrix.targetMacOS)) {
      return false;
    }

    const passedScenarioIds = new Set(
      matrix.scenarios
        ?.filter((scenario) =>
          scenario.status === "passed" && hasFdaScenarioEvidence(scenario)
        )
        .map((scenario) => scenario.id)
        .filter((id): id is string => typeof id === "string"),
    );

    return DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.every((scenarioId) =>
      passedScenarioIds.has(scenarioId)
    );
  } catch {
    return false;
  }
}

function resolvePrivilegedHelperExecutablePackagingEvidence(
  projectRoot: string,
): boolean {
  const configPath = path.join(projectRoot, "electron-builder.json");
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      mac?: {
        extraFiles?: Array<{
          filter?: string[];
          from?: string;
          to?: string;
        }>;
      };
    };

    return config.mac?.extraFiles?.some((entry) =>
      entry.from === path.dirname(DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH)
      && entry.to === "Library/LaunchServices"
      && entry.filter?.includes(DISK_SCAN_HELPER_LABEL)
    ) === true;
  } catch {
    return false;
  }
}

function hasMachOHeader(executablePath: string): boolean {
  const header = fs.readFileSync(executablePath).subarray(0, 4);
  if (header.length < 4) {
    return false;
  }

  const magic = header.toString("hex");
  return magic === "feedface"
    || magic === "feedfacf"
    || magic === "cefaedfe"
    || magic === "cffaedfe"
    || magic === "cafebabe"
    || magic === "bebafeca"
    || magic === "cafebabf"
    || magic === "bfbafeca";
}

function buildIdentityInput(
  teamId: string | undefined,
  designatedRequirement: string | undefined,
): HelperRegistrationIdentityInput {
  return {
    ...(teamId ? { teamId } : {}),
    ...(designatedRequirement ? { designatedRequirement } : {}),
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

export function isValidAppleTeamId(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && /^[A-Z0-9]{10}$/.test(value);
}

export function isValidDesignatedRequirement(
  value: string | null | undefined,
  teamId: string | null | undefined,
): value is string {
  if (!value || !isValidAppleTeamId(teamId)) {
    return false;
  }

  return value === buildHelperCodeSigningRequirement(teamId);
}

export function isConcreteMacOsVersion(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && /^\d{1,2}\.\d{1,2}(?:\.\d{1,2})?$/.test(value);
}

function hasFdaScenarioEvidence(scenario: {
  notes?: string;
  validatedAt?: string;
  validator?: string;
}): boolean {
  return isIsoDateTime(scenario.validatedAt)
    && hasNonEmptyText(scenario.validator)
    && hasNonEmptyText(scenario.notes);
}

function hasNonEmptyText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTime(value: string | undefined): value is string {
  if (!hasNonEmptyText(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && value.includes("T");
}
