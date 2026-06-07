import {
  buildHelperFdaMatrixAudit,
  type HelperFdaMatrixAudit,
} from "./helperFdaValidationMatrix";
import {
  buildHelperIdentityAudit,
  type HelperIdentityAudit,
} from "./helperIdentityAudit";
import {
  buildHelperPreflightAudit,
  type HelperPreflightAudit,
} from "./helperPreflightAudit";
import {
  buildHelperReadinessReport,
  HELPER_PEER_VALIDATION_READY_ENV,
  type HelperReadinessReport,
} from "./helperReadinessAudit";
import {
  HELPER_APP_BUNDLE_ID_ENV,
  resolveHelperRegistrationPreflight,
  resolveHelperRegistrationPreflightInputFromEnv,
} from "./helperRegistration";
import {
  buildHelperServiceManagementAudit,
  type HelperServiceManagementAudit,
  type MacOsServiceManagementProbe,
} from "./macosServiceManagementProbe";

export interface HelperReadinessBundle {
  blockers: string[];
  canEnableHelperByDefault: boolean;
  componentStatus: HelperReadinessBundleComponentStatus;
  fdaMatrix: HelperFdaMatrixAudit;
  identity: HelperIdentityAudit;
  preflight: HelperPreflightAudit;
  readiness: HelperReadinessReport;
  serviceManagement: HelperServiceManagementAudit;
  status: "blocked" | "ready";
}

export interface HelperReadinessBundleComponentStatus {
  fdaMatrix: "blocked" | "ready";
  identity: "blocked" | "ready";
  preflight: "blocked" | "ready";
  readiness: "blocked" | "ready";
  serviceManagement: "blocked" | "ready";
}

export interface BuildHelperReadinessBundleOptions {
  appBundleIdentifier?: string | null;
  designatedRequirement?: string | null;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  peerValidationReady?: boolean;
  projectRoot?: string;
  resourcesPath?: string | null;
  serviceManagementProbe?: MacOsServiceManagementProbe;
  teamId?: string | null;
}

export async function buildHelperReadinessBundle(
  options: BuildHelperReadinessBundleOptions = {},
): Promise<HelperReadinessBundle> {
  const env = buildEvidenceEnv(options);
  const projectRoot = options.projectRoot ?? process.cwd();
  const identity = buildHelperIdentityAudit({
    appBundleIdentifier: options.appBundleIdentifier,
    designatedRequirement: options.designatedRequirement,
    env,
    projectRoot,
    teamId: options.teamId,
  });
  const fdaMatrix = buildHelperFdaMatrixAudit({ projectRoot });
  const serviceManagement = await buildHelperServiceManagementAudit({
    env,
    platform: options.platform,
    probe: options.serviceManagementProbe,
    resourcesPath: options.resourcesPath,
  });
  const preflight = buildHelperPreflightAudit({
    env,
    projectRoot,
  });
  const registrationPreflight = resolveHelperRegistrationPreflight(
    resolveHelperRegistrationPreflightInputFromEnv(env, projectRoot),
  );
  const readiness = buildHelperReadinessReport({
    fdaMatrixStatus: fdaMatrix.status,
    peerValidationStatus: readBooleanEvidenceEnv(
      env[HELPER_PEER_VALIDATION_READY_ENV],
    )
      ? "ready"
      : "blocked",
    preflightEvidence: {
      artifactEvidence: preflight.artifactEvidence,
      confirmations: preflight.confirmations,
      effectiveEvidence: preflight.effectiveEvidence,
    },
    registrationPreflight,
    serviceManagementStatus: serviceManagement.serviceManagementStatus,
  });

  return {
    blockers: readiness.blockers,
    canEnableHelperByDefault: readiness.canEnableHelperByDefault,
    componentStatus: {
      fdaMatrix: fdaMatrix.status,
      identity: identity.status,
      preflight: preflight.status,
      readiness: readiness.status,
      serviceManagement: serviceManagement.status,
    },
    fdaMatrix,
    identity,
    preflight,
    readiness,
    serviceManagement,
    status: readiness.status,
  };
}

function buildEvidenceEnv(
  options: BuildHelperReadinessBundleOptions,
): NodeJS.ProcessEnv {
  const env = { ...(options.env ?? process.env) };
  if (
    options.appBundleIdentifier !== undefined
    && options.appBundleIdentifier !== null
  ) {
    env[HELPER_APP_BUNDLE_ID_ENV] = options.appBundleIdentifier;
  }
  if (options.teamId !== undefined && options.teamId !== null) {
    env.SCAN_HELPER_TEAM_ID = options.teamId;
  }
  if (
    options.designatedRequirement !== undefined
    && options.designatedRequirement !== null
  ) {
    env.SCAN_HELPER_DESIGNATED_REQUIREMENT = options.designatedRequirement;
  }
  if (options.peerValidationReady === true) {
    env[HELPER_PEER_VALIDATION_READY_ENV] = "true";
  }

  return env;
}

function readBooleanEvidenceEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}
