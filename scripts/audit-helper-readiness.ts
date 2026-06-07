import { buildHelperReadinessReport } from "../src/main/services/helper/helperReadinessAudit";
import { buildHelperPreflightAudit } from "../src/main/services/helper/helperPreflightAudit";
import {
  HELPER_DESIGNATED_REQUIREMENT_ENV,
  HELPER_FDA_VALIDATION_MATRIX_READY_ENV,
  HELPER_PACKAGING_ENTITLEMENTS_READY_ENV,
  HELPER_PRIVILEGED_EXECUTABLE_READY_ENV,
  HELPER_TEAM_ID_ENV,
  HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV,
  resolveHelperRegistrationPreflight,
  resolveHelperRegistrationPreflightInputFromEnv,
} from "../src/main/services/helper/helperRegistration";
import {
  createMacOsServiceManagementProbeFromEnv,
  HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV,
} from "../src/main/services/helper/macosServiceManagementProbe";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const rawArgs = process.argv.slice(2);
const auditOutputPath = resolveAuditOutputPath(rawArgs);
const projectRoot = resolveOptionalArg(rawArgs, "--project-root")
  ?? process.cwd();
const resourcesPath = resolveOptionalArg(rawArgs, "--resources-path")
  ?? (typeof process.resourcesPath === "string" ? process.resourcesPath : null);
const env = buildAuditEnv(rawArgs);
const platform = resolvePlatform(rawArgs);
const preflight = buildHelperPreflightAudit({ env, projectRoot });
const registrationPreflight = resolveHelperRegistrationPreflight(
  resolveHelperRegistrationPreflightInputFromEnv(env, projectRoot),
);
const serviceManagementStatus = await resolveServiceManagementStatus();
const report = buildHelperReadinessReport({
  registrationPreflight,
  preflightEvidence: {
    artifactEvidence: preflight.artifactEvidence,
    confirmations: preflight.confirmations,
    effectiveEvidence: preflight.effectiveEvidence,
  },
  fdaMatrixStatus: registrationPreflight.blockers.includes(
    "fda-validation-matrix-missing",
  )
    ? "blocked"
    : "ready",
  serviceManagementStatus,
});
const reportJson = JSON.stringify(report, null, 2);

console.log(reportJson);
writeAuditOutputFile(auditOutputPath, reportJson);

if (report.status !== "ready") {
  process.exitCode = 1;
}

async function resolveServiceManagementStatus(): Promise<
  Parameters<typeof buildHelperReadinessReport>[0]["serviceManagementStatus"]
> {
  try {
    const probe = createMacOsServiceManagementProbeFromEnv(
      env,
      platform,
      resourcesPath,
    );
    const status = await probe.getStatus();
    return status.state;
  } catch {
    return "unknown";
  }
}

function buildAuditEnv(rawArgs: string[]): NodeJS.ProcessEnv {
  const probeBin = resolveOptionalArg(rawArgs, "--probe-bin");
  const teamId = resolveOptionalArg(rawArgs, "--team-id");
  const designatedRequirement = resolveOptionalArg(
    rawArgs,
    "--designated-requirement",
  );

  return {
    ...process.env,
    ...(probeBin ? { [HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV]: probeBin } : {}),
    ...(teamId ? { [HELPER_TEAM_ID_ENV]: teamId } : {}),
    ...(designatedRequirement
      ? { [HELPER_DESIGNATED_REQUIREMENT_ENV]: designatedRequirement }
      : {}),
    ...confirmationEnv(rawArgs),
  };
}

function confirmationEnv(rawArgs: string[]): NodeJS.ProcessEnv {
  return {
    ...(hasFlag(rawArgs, "--confirm-packaging-entitlements")
      ? { [HELPER_PACKAGING_ENTITLEMENTS_READY_ENV]: "true" }
      : {}),
    ...(hasFlag(rawArgs, "--confirm-privileged-helper-executable")
      ? { [HELPER_PRIVILEGED_EXECUTABLE_READY_ENV]: "true" }
      : {}),
    ...(hasFlag(rawArgs, "--confirm-helper-xpc-enumerate-bridge")
      ? { [HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV]: "true" }
      : {}),
    ...(hasFlag(rawArgs, "--confirm-fda-validation-matrix")
      ? { [HELPER_FDA_VALIDATION_MATRIX_READY_ENV]: "true" }
      : {}),
  };
}

function hasFlag(rawArgs: string[], name: string): boolean {
  return rawArgs.includes(name);
}

function resolvePlatform(rawArgs: string[]): NodeJS.Platform {
  return (resolveOptionalArg(rawArgs, "--platform") ?? process.platform) as NodeJS.Platform;
}

function resolveOptionalArg(
  rawArgs: string[],
  name: string,
): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  const value = rawArgs[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`missing value for ${name}`);
  }

  return value;
}
