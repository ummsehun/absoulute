import fs from "node:fs";
import path from "node:path";
import {
  DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS,
  DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
  HELPER_APP_BUNDLE_ID_ENV,
  HELPER_DESIGNATED_REQUIREMENT_ENV,
  HELPER_FDA_VALIDATION_MATRIX_READY_ENV,
  HELPER_PACKAGING_ENTITLEMENTS_READY_ENV,
  HELPER_PRIVILEGED_EXECUTABLE_READY_ENV,
  HELPER_TEAM_ID_ENV,
  HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV,
  getHelperRegistrationContract,
  isConcreteMacOsVersion,
  isProductionAppBundleIdentifier,
  isValidAppleTeamId,
  isValidDesignatedRequirement,
  resolveFdaValidationMatrixEvidence,
  resolveHelperRegistrationPreflight,
  resolveHelperRegistrationPreflightInputFromEnv,
  resolveHelperXpcEnumerateBridgeEvidence,
  resolvePackagingEntitlementsEvidence,
  resolvePrivilegedHelperExecutableEvidence,
  resolvePrivilegedHelperListenerRequirementEvidence,
  type HelperRegistrationBlocker,
  type HelperRegistrationContract,
  type HelperRegistrationPreflightInput,
} from "./helperRegistration";

export {
  DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
};

export interface HelperPreflightAuditEvidence {
  teamId: boolean;
  productionBundleIdentifier: boolean;
  designatedRequirement: boolean;
  packagingEntitlements: boolean;
  privilegedHelperExecutable: boolean;
  helperXpcEnumerateBridge: boolean;
  privilegedHelperListenerRequirement: boolean;
  fdaValidationMatrix: boolean;
}

export interface HelperPreflightAudit {
  contract: HelperRegistrationContract;
  status: "blocked" | "ready";
  blockers: HelperRegistrationBlocker[];
  artifactEvidence: HelperPreflightAuditEvidence;
  confirmations: HelperPreflightAuditEvidence;
  effectiveEvidence: HelperPreflightAuditEvidence;
  readiness: HelperPreflightAuditReadiness;
  remediation: HelperPreflightAuditRemediationAction[];
  details: HelperPreflightAuditDetails;
}

export interface HelperPreflightAuditReadiness {
  enumerateReady: boolean;
  installBlockers: HelperRegistrationBlocker[];
  installReady: boolean;
}

export interface HelperPreflightAuditRemediationAction {
  blocker: HelperRegistrationBlocker;
  commands?: string[];
  description: string;
  requiredArtifacts?: string[];
  requiredInputs?: string[];
}

export interface HelperPreflightAuditDetails {
  privilegedHelperListenerRequirement: HelperListenerRequirementAuditDetails;
  fdaValidationMatrix: HelperFdaValidationMatrixAuditDetails;
}

export interface HelperListenerRequirementAuditDetails {
  metadataFound: boolean;
  ready?: boolean;
  teamId?: string;
  requirement?: string;
}

export interface HelperFdaValidationMatrixAuditDetails {
  matrixFound: boolean;
  targetMacOS?: string;
  targetMacOSReady: boolean;
  failedScenarios: string[];
  missingPassedScenarios: string[];
  scenariosMissingEvidence: string[];
}

export interface BuildHelperPreflightAuditOptions {
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
}

export type HelperPreflightAuditStrictMode = "enumerate" | "install";

export function buildHelperPreflightAudit(
  options: BuildHelperPreflightAuditOptions = {},
): HelperPreflightAudit {
  const env = options.env ?? process.env;
  const projectRoot = options.projectRoot ?? process.cwd();
  const input = resolveHelperRegistrationPreflightInputFromEnv(
    env,
    projectRoot,
  );
  const preflight = resolveHelperRegistrationPreflight(input);
  const installBlockers = preflight.blockers.filter((blocker) =>
    blocker !== "fda-validation-matrix-missing"
    && blocker !== "helper-xpc-enumerate-bridge-missing"
  );

  return {
    contract: getHelperRegistrationContract(),
    status: preflight.status,
    blockers: preflight.blockers,
    artifactEvidence: buildArtifactEvidence(input, projectRoot),
    confirmations: buildConfirmations(env, input),
    effectiveEvidence: buildEffectiveEvidence(input, preflight.blockers),
    readiness: {
      enumerateReady: preflight.status === "ready",
      installBlockers,
      installReady: installBlockers.length === 0,
    },
    remediation: preflight.blockers.map(remediationForBlocker),
    details: {
      privilegedHelperListenerRequirement:
        readListenerRequirementDetails(projectRoot),
      fdaValidationMatrix: readFdaValidationMatrixDetails(projectRoot),
    },
  };
}

function remediationForBlocker(
  blocker: HelperRegistrationBlocker,
): HelperPreflightAuditRemediationAction {
  const actions: Record<
    HelperRegistrationBlocker,
    HelperPreflightAuditRemediationAction
  > = {
    "team-id-missing": {
      blocker,
      description: "Set the production Apple Developer Team ID.",
      requiredInputs: [HELPER_TEAM_ID_ENV],
    },
    "production-bundle-identifier-missing": {
      blocker,
      description:
        "Set the production app bundle identifier instead of the development com.example identifier.",
      requiredInputs: [HELPER_APP_BUNDLE_ID_ENV],
    },
    "designated-requirement-missing": {
      blocker,
      description:
        "Set the designated requirement that matches the production app signing identity.",
      requiredInputs: [HELPER_DESIGNATED_REQUIREMENT_ENV],
    },
    "packaging-entitlements-missing": {
      blocker,
      description:
        "Confirm macOS hardened runtime and entitlement files are present and explicitly approved.",
      requiredArtifacts: [
        "electron-builder.json",
        "resources/entitlements/mac.plist",
        "resources/entitlements/mac.inherit.plist",
      ],
      requiredInputs: [HELPER_PACKAGING_ENTITLEMENTS_READY_ENV],
    },
    "privileged-helper-executable-missing": {
      blocker,
      commands: ["pnpm build:native:privileged-helper"],
      description:
        "Build and explicitly approve the packaged privileged helper executable.",
      requiredArtifacts: [DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH],
      requiredInputs: [HELPER_PRIVILEGED_EXECUTABLE_READY_ENV],
    },
    "helper-xpc-enumerate-bridge-missing": {
      blocker,
      commands: ["pnpm build:native:helper-xpc-enumerate"],
      description:
        "Build and explicitly approve the packaged XPC enumerate bridge command.",
      requiredArtifacts: [
        DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
      ],
      requiredInputs: [HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV],
    },
    "privileged-helper-listener-requirement-missing": {
      blocker,
      commands: ["pnpm build:native:privileged-helper"],
      description:
        "Generate listener requirement metadata from the configured production Team ID.",
      requiredArtifacts: [DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH],
    },
    "fda-validation-matrix-missing": {
      blocker,
      commands: [
        "pnpm record:helper-fda-scenario --list",
        "pnpm record:helper-fda-scenario --scenario <scenario-id> --target-macos <macos-version> --validator <validator> --notes <notes>",
      ],
      description:
        "Record every required FDA validation scenario for the target macOS version.",
      requiredArtifacts: [DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH],
      requiredInputs: [HELPER_FDA_VALIDATION_MATRIX_READY_ENV],
    },
  };

  return actions[blocker];
}

export function resolveHelperPreflightAuditStrictExitCode(
  audit: HelperPreflightAudit,
  mode: HelperPreflightAuditStrictMode,
): 0 | 1 {
  if (mode === "install") {
    return audit.readiness.installReady ? 0 : 1;
  }

  return audit.readiness.enumerateReady ? 0 : 1;
}

export function resolveHelperPreflightAuditStrictMode(
  value: string | undefined,
): HelperPreflightAuditStrictMode {
  if (value === "install" || value === "enumerate") {
    return value;
  }

  return "enumerate";
}

function buildArtifactEvidence(
  input: HelperRegistrationPreflightInput,
  projectRoot: string,
): HelperPreflightAuditEvidence {
  const teamIdReady = isValidAppleTeamId(input.identity?.teamId);
  const productionBundleIdentifierReady = isProductionAppBundleIdentifier(
    input.identity?.appBundleIdentifier,
  );
  const designatedRequirementReady = isValidDesignatedRequirement(
    input.identity?.designatedRequirement,
    input.identity?.teamId,
    input.identity?.appBundleIdentifier,
  );

  return {
    teamId: teamIdReady,
    productionBundleIdentifier: productionBundleIdentifierReady,
    designatedRequirement: designatedRequirementReady,
    packagingEntitlements: resolvePackagingEntitlementsEvidence(projectRoot),
    privilegedHelperExecutable:
      resolvePrivilegedHelperExecutableEvidence(projectRoot),
    helperXpcEnumerateBridge:
      resolveHelperXpcEnumerateBridgeEvidence(projectRoot),
    privilegedHelperListenerRequirement:
      resolvePrivilegedHelperListenerRequirementEvidence(
        projectRoot,
        input.identity?.teamId,
        input.identity?.appBundleIdentifier,
      ),
    fdaValidationMatrix: resolveFdaValidationMatrixEvidence(projectRoot),
  };
}

function buildConfirmations(
  env: NodeJS.ProcessEnv,
  input: HelperRegistrationPreflightInput,
): HelperPreflightAuditEvidence {
  const teamIdReady = isValidAppleTeamId(input.identity?.teamId);
  const productionBundleIdentifierReady = isProductionAppBundleIdentifier(
    input.identity?.appBundleIdentifier,
  );
  const designatedRequirementReady = isValidDesignatedRequirement(
    input.identity?.designatedRequirement,
    input.identity?.teamId,
    input.identity?.appBundleIdentifier,
  );

  return {
    teamId: teamIdReady,
    productionBundleIdentifier: productionBundleIdentifierReady,
    designatedRequirement: designatedRequirementReady,
    packagingEntitlements:
      readBooleanEvidenceEnv(env[HELPER_PACKAGING_ENTITLEMENTS_READY_ENV]),
    privilegedHelperExecutable:
      readBooleanEvidenceEnv(env[HELPER_PRIVILEGED_EXECUTABLE_READY_ENV]),
    helperXpcEnumerateBridge:
      readBooleanEvidenceEnv(env[HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV]),
    privilegedHelperListenerRequirement:
      input.privilegedHelperListenerRequirementReady === true,
    fdaValidationMatrix:
      readBooleanEvidenceEnv(env[HELPER_FDA_VALIDATION_MATRIX_READY_ENV]),
  };
}

function buildEffectiveEvidence(
  input: HelperRegistrationPreflightInput,
  blockers: HelperRegistrationBlocker[],
): HelperPreflightAuditEvidence {
  return {
    teamId: !blockers.includes("team-id-missing"),
    productionBundleIdentifier:
      !blockers.includes("production-bundle-identifier-missing"),
    designatedRequirement: !blockers.includes("designated-requirement-missing"),
    packagingEntitlements: input.packagingEntitlementsReady === true,
    privilegedHelperExecutable: input.privilegedHelperExecutableReady === true,
    helperXpcEnumerateBridge:
      input.helperXpcEnumerateBridgeReady === true,
    privilegedHelperListenerRequirement:
      input.privilegedHelperListenerRequirementReady === true,
    fdaValidationMatrix: input.fdaValidationMatrixReady === true,
  };
}

function readBooleanEvidenceEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function readListenerRequirementDetails(
  projectRoot: string,
): HelperListenerRequirementAuditDetails {
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

    return {
      metadataFound: true,
      ...(typeof metadata.ready === "boolean" ? { ready: metadata.ready } : {}),
      ...(typeof metadata.teamId === "string" ? { teamId: metadata.teamId } : {}),
      ...(typeof metadata.requirement === "string"
        ? { requirement: metadata.requirement }
        : {}),
    };
  } catch {
    return {
      metadataFound: false,
    };
  }
}

function readFdaValidationMatrixDetails(
  projectRoot: string,
): HelperFdaValidationMatrixAuditDetails {
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
    const passedScenarioIds = new Set(
      matrix.scenarios
        ?.filter((scenario) =>
          scenario.status === "passed" && hasFdaScenarioEvidence(scenario)
        )
        .map((scenario) => scenario.id)
        .filter((id): id is string => typeof id === "string"),
    );
    const scenarioById = new Map(
      matrix.scenarios
        ?.filter((scenario) => typeof scenario.id === "string")
        .map((scenario) => [scenario.id as string, scenario]),
    );

    return {
      matrixFound: true,
      ...(typeof matrix.targetMacOS === "string"
        ? { targetMacOS: matrix.targetMacOS }
        : {}),
      targetMacOSReady: isConcreteMacOsVersion(matrix.targetMacOS),
      failedScenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.filter(
        (scenarioId) => scenarioById.get(scenarioId)?.status === "failed",
      ),
      missingPassedScenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.filter(
        (scenarioId) => !passedScenarioIds.has(scenarioId),
      ),
      scenariosMissingEvidence: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.filter(
        (scenarioId) => !hasFdaScenarioEvidence(scenarioById.get(scenarioId)),
      ),
    };
  } catch {
    return {
      matrixFound: false,
      targetMacOSReady: false,
      failedScenarios: [],
      missingPassedScenarios: [...DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS],
      scenariosMissingEvidence: [...DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS],
    };
  }
}

function hasFdaScenarioEvidence(
  scenario:
    | {
      notes?: string;
      validatedAt?: string;
      validator?: string;
    }
    | undefined,
): boolean {
  return isIsoDateTime(scenario?.validatedAt)
    && hasNonEmptyText(scenario?.validator)
    && hasNonEmptyText(scenario?.notes);
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
