import fs from "node:fs";
import path from "node:path";

export type HelperServiceManagementModel = "smappservice-daemon";

export type HelperRegistrationBlocker =
  | "team-id-missing"
  | "production-bundle-identifier-missing"
  | "designated-requirement-missing"
  | "packaging-entitlements-missing"
  | "privileged-helper-executable-missing"
  | "helper-xpc-enumerate-bridge-missing"
  | "privileged-helper-listener-requirement-missing"
  | "fda-validation-matrix-missing";

export interface HelperRegistrationIdentityInput {
  appBundleIdentifier?: string | null;
  teamId?: string | null;
  designatedRequirement?: string | null;
}

export interface HelperRegistrationPreflightInput {
  identity?: HelperRegistrationIdentityInput;
  packagingEntitlementsReady?: boolean;
  privilegedHelperExecutableReady?: boolean;
  helperXpcEnumerateBridgeReady?: boolean;
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
export const HELPER_APP_BUNDLE_ID_ENV = "SCAN_HELPER_APP_BUNDLE_ID";
export const HELPER_DESIGNATED_REQUIREMENT_ENV =
  "SCAN_HELPER_DESIGNATED_REQUIREMENT";
export const HELPER_PACKAGING_ENTITLEMENTS_READY_ENV =
  "SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY";
export const HELPER_PRIVILEGED_EXECUTABLE_READY_ENV =
  "SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY";
export const HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV =
  "SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY";
export const HELPER_FDA_VALIDATION_MATRIX_READY_ENV =
  "SCAN_HELPER_FDA_VALIDATION_MATRIX_READY";

export const DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER =
  "com.spacelens.app";

// Team ID is part of the helper's designated requirement and ships inside the
// signed bundle anyway, so it is safe to bake in as a build-time constant.
export const DISK_VISUALIZER_APPLE_TEAM_ID = "RXB3U7P2MN";

export const DISK_SCAN_HELPER_LABEL =
  "com.example.diskvisualizer.privileged-helper";

export const DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME =
  `${DISK_SCAN_HELPER_LABEL}.plist`;

export const DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH =
  `Contents/Library/LaunchDaemons/${DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME}`;

// SMAppService validates BundleProgram targets against the app bundle's main
// executable directory; helpers under the legacy SMJobBless location
// (Contents/Library/LaunchServices) fail with errSecCSBadBundleFormat (-67028).
export const DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH =
  `Contents/MacOS/${DISK_SCAN_HELPER_LABEL}`;

export const DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH =
  `resources/helper/LaunchServices/${DISK_SCAN_HELPER_LABEL}`;
export const DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH =
  "resources/bin/helper-xpc-enumerate-macos";

export const DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH =
  `${DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH}.requirement.json`;
export const DISK_SCAN_HELPER_REQUIREMENT_METADATA_BUNDLE_RELATIVE_PATH =
  `${DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH}.requirement.json`;
export const DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH =
  "docs/helper-fda-validation-matrix.json";
export const DISK_SCAN_HELPER_FDA_MATRIX_RESOURCES_RELATIVE_PATH =
  "helper-fda-validation-matrix.json";
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
  const appBundleIdentifier = input.identity?.appBundleIdentifier;
  const teamId = input.identity?.teamId;
  const designatedRequirement = input.identity?.designatedRequirement;

  if (!isValidAppleTeamId(teamId)) {
    blockers.push("team-id-missing");
  }

  if (!isProductionAppBundleIdentifier(appBundleIdentifier)) {
    blockers.push("production-bundle-identifier-missing");
  }

  if (!isValidDesignatedRequirement(
    designatedRequirement,
    teamId,
    appBundleIdentifier,
  )) {
    blockers.push("designated-requirement-missing");
  }

  if (!input.packagingEntitlementsReady) {
    blockers.push("packaging-entitlements-missing");
  }

  if (!input.privilegedHelperExecutableReady) {
    blockers.push("privileged-helper-executable-missing");
  }

  if (!input.helperXpcEnumerateBridgeReady) {
    blockers.push("helper-xpc-enumerate-bridge-missing");
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

export function buildHelperCodeSigningRequirement(
  teamId: string,
  appBundleIdentifier = DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
): string {
  if (!isValidAppleTeamId(teamId)) {
    throw new Error("helper code signing requirement needs a valid Apple Team ID");
  }

  if (!isValidAppBundleIdentifier(appBundleIdentifier)) {
    throw new Error("helper code signing requirement needs a valid app bundle identifier");
  }

  return `identifier "${appBundleIdentifier}" and anchor apple generic and certificate leaf[subject.OU] = "${teamId}"`;
}

export function resolveHelperRegistrationPreflightInputFromEnv(
  env: NodeJS.ProcessEnv,
  projectRoot = process.cwd(),
): HelperRegistrationPreflightInput {
  const appBundleIdentifier = readNonEmptyEnv(env[HELPER_APP_BUNDLE_ID_ENV]);
  const teamId = readNonEmptyEnv(env[HELPER_TEAM_ID_ENV]);
  const designatedRequirement = readNonEmptyEnv(
    env[HELPER_DESIGNATED_REQUIREMENT_ENV],
  );

  return {
    identity: buildIdentityInput(
      appBundleIdentifier,
      teamId,
      designatedRequirement,
    ),
    packagingEntitlementsReady: readBooleanEvidenceEnv(
      env[HELPER_PACKAGING_ENTITLEMENTS_READY_ENV],
    ) && resolvePackagingEntitlementsEvidence(projectRoot),
    privilegedHelperExecutableReady: readBooleanEvidenceEnv(
      env[HELPER_PRIVILEGED_EXECUTABLE_READY_ENV],
    ) && resolvePrivilegedHelperExecutableEvidence(projectRoot),
    helperXpcEnumerateBridgeReady: readBooleanEvidenceEnv(
      env[HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV],
    ) && resolveHelperXpcEnumerateBridgeEvidence(projectRoot),
    privilegedHelperListenerRequirementReady:
      resolvePrivilegedHelperListenerRequirementEvidence(
        projectRoot,
        teamId,
        appBundleIdentifier,
      ),
    fdaValidationMatrixReady: readBooleanEvidenceEnv(
      env[HELPER_FDA_VALIDATION_MATRIX_READY_ENV],
    ) && resolveFdaValidationMatrixEvidence(projectRoot),
  };
}

export interface PackagedHelperPreflightContext {
  appBundlePath: string;
  resourcesPath: string;
}

export function resolvePackagedAppBundlePath(
  resourcesPath: string | null | undefined,
  expectedBundleIdentifier = DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
): string | null {
  if (!resourcesPath) {
    return null;
  }

  const appBundlePath = path.resolve(resourcesPath, "..", "..");
  if (!appBundlePath.endsWith(".app")) {
    return null;
  }

  try {
    const infoPlist = fs.readFileSync(
      path.join(appBundlePath, "Contents", "Info.plist"),
      "utf8",
    );
    const match = infoPlist.match(
      /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/,
    );
    return match?.[1] === expectedBundleIdentifier ? appBundlePath : null;
  } catch {
    return null;
  }
}

export function resolveHelperRegistrationPreflightInputForPackagedApp(
  context: PackagedHelperPreflightContext,
): HelperRegistrationPreflightInput {
  const teamId = DISK_VISUALIZER_APPLE_TEAM_ID;
  const appBundleIdentifier = DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER;

  return {
    identity: {
      appBundleIdentifier,
      teamId,
      designatedRequirement: buildHelperCodeSigningRequirement(
        teamId,
        appBundleIdentifier,
      ),
    },
    // Entitlements are baked into the bundle at build time and enforced by
    // code signing (verified by verify:mac-signing during build:mac); the
    // bundle-identity check in resolvePackagedAppBundlePath is the runtime
    // evidence that this is our signed artifact layout.
    packagingEntitlementsReady: true,
    privilegedHelperExecutableReady:
      isExecutableMachO(path.join(
        context.appBundlePath,
        DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH,
      ))
      && fs.existsSync(path.join(
        context.appBundlePath,
        DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH,
      )),
    helperXpcEnumerateBridgeReady: isExecutableMachO(path.join(
      context.resourcesPath,
      "bin",
      path.basename(DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH),
    )),
    privilegedHelperListenerRequirementReady:
      validateListenerRequirementFile(
        path.join(
          context.appBundlePath,
          DISK_SCAN_HELPER_REQUIREMENT_METADATA_BUNDLE_RELATIVE_PATH,
        ),
        teamId,
        appBundleIdentifier,
      ),
    fdaValidationMatrixReady: validateFdaMatrixFile(path.join(
      context.resourcesPath,
      DISK_SCAN_HELPER_FDA_MATRIX_RESOURCES_RELATIVE_PATH,
    )),
  };
}

export function resolveHelperRegistrationPreflightInputAuto(
  env: NodeJS.ProcessEnv = process.env,
  projectRoot = process.cwd(),
  resourcesPath: string | null = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null,
): HelperRegistrationPreflightInput {
  const appBundlePath = resolvePackagedAppBundlePath(resourcesPath);
  if (appBundlePath && resourcesPath) {
    return resolveHelperRegistrationPreflightInputForPackagedApp({
      appBundlePath,
      resourcesPath,
    });
  }

  return resolveHelperRegistrationPreflightInputFromEnv(env, projectRoot);
}

export function resolvePackagingEntitlementsEvidence(
  projectRoot = process.cwd(),
): boolean {
  const entitlementsPath = "resources/entitlements/mac.plist";
  const inheritedEntitlementsPath = "resources/entitlements/mac.inherit.plist";

  try {
    const config = JSON.parse(fs.readFileSync(
      path.join(projectRoot, "electron-builder.json"),
      "utf8",
    )) as {
      mac?: {
        entitlements?: string;
        entitlementsInherit?: string;
        hardenedRuntime?: boolean;
      };
    };

    return config.mac?.hardenedRuntime === true
      && config.mac.entitlements === entitlementsPath
      && config.mac.entitlementsInherit === inheritedEntitlementsPath
      && fs.existsSync(path.join(projectRoot, entitlementsPath))
      && fs.existsSync(path.join(projectRoot, inheritedEntitlementsPath));
  } catch {
    return false;
  }
}

export function resolvePrivilegedHelperExecutableEvidence(
  projectRoot = process.cwd(),
): boolean {
  const executablePath = path.join(
    projectRoot,
    DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  );

  return isExecutableMachO(executablePath)
    && resolvePrivilegedHelperBundlePackagingEvidence(projectRoot);
}

export function resolveHelperXpcEnumerateBridgeEvidence(
  projectRoot = process.cwd(),
): boolean {
  const bridgePath = path.join(
    projectRoot,
    DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
  );

  return isExecutableMachO(bridgePath)
    && resolveHelperXpcEnumerateBridgePackagingEvidence(projectRoot);
}

export function resolvePrivilegedHelperListenerRequirementEvidence(
  projectRoot = process.cwd(),
  teamId?: string | null,
  appBundleIdentifier: string | null | undefined =
    DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
): boolean {
  if (!isValidAppleTeamId(teamId)) {
    return false;
  }
  if (!isValidAppBundleIdentifier(appBundleIdentifier)) {
    return false;
  }

  return validateListenerRequirementFile(
    path.join(
      projectRoot,
      DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
    ),
    teamId,
    appBundleIdentifier,
  );
}

function validateListenerRequirementFile(
  metadataPath: string,
  teamId: string,
  appBundleIdentifier: string,
): boolean {
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
      ready?: boolean;
      requirement?: string;
      teamId?: string;
    };
    const expectedRequirement = buildHelperCodeSigningRequirement(
      teamId,
      appBundleIdentifier,
    );
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
  return validateFdaMatrixFile(
    path.join(projectRoot, DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH),
  );
}

function validateFdaMatrixFile(matrixPath: string): boolean {
  try {
    const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as {
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

function resolvePrivilegedHelperBundlePackagingEvidence(
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

    const extraFiles = config.mac?.extraFiles ?? [];
    const packagesExecutable = extraFiles.some((entry) =>
      entry.from === path.dirname(DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH)
      && entry.to === "MacOS"
      && entry.filter?.includes(DISK_SCAN_HELPER_LABEL)
    );
    const packagesLaunchDaemonPlist = extraFiles.some((entry) =>
      entry.from === "resources/helper/LaunchDaemons"
      && entry.to === "Library/LaunchDaemons"
      && entry.filter?.includes(DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME)
    );

    return packagesExecutable && packagesLaunchDaemonPlist;
  } catch {
    return false;
  }
}

function resolveHelperXpcEnumerateBridgePackagingEvidence(
  projectRoot: string,
): boolean {
  const configPath = path.join(projectRoot, "electron-builder.json");
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      extraResources?: Array<{
        filter?: string[];
        from?: string;
        to?: string;
      }>;
    };

    const bridgeName = path.basename(
      DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
    );
    return (config.extraResources ?? []).some((entry) =>
      entry.from === path.dirname(
        DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
      )
      && entry.to === "bin"
      && entry.filter?.includes(bridgeName)
    );
  } catch {
    return false;
  }
}

function isExecutableMachO(executablePath: string): boolean {
  try {
    const stat = fs.statSync(executablePath);
    return stat.isFile()
      && (stat.mode & 0o111) !== 0
      && hasMachOHeader(executablePath);
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
  appBundleIdentifier: string | undefined,
  teamId: string | undefined,
  designatedRequirement: string | undefined,
): HelperRegistrationIdentityInput {
  return {
    ...(appBundleIdentifier ? { appBundleIdentifier } : {}),
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
  appBundleIdentifier: string | null | undefined =
    DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
): value is string {
  if (!value || !isValidAppleTeamId(teamId)) {
    return false;
  }

  if (!isValidAppBundleIdentifier(appBundleIdentifier)) {
    return false;
  }

  return value === buildHelperCodeSigningRequirement(
    teamId,
    appBundleIdentifier,
  );
}

export function isProductionAppBundleIdentifier(
  value: string | null | undefined,
): value is string {
  if (!isValidAppBundleIdentifier(value)) {
    return false;
  }

  return !value.startsWith("com.example.")
    && !value.includes(".example.");
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

function isValidAppBundleIdentifier(
  value: string | null | undefined,
): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*)+$/.test(value);
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
