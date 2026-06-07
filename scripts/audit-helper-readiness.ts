import { buildHelperReadinessReport } from "../src/main/services/helper/helperReadinessAudit";
import { buildHelperPreflightAudit } from "../src/main/services/helper/helperPreflightAudit";
import {
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
const env = buildAuditEnv(rawArgs);
const platform = resolvePlatform(rawArgs);
const resourcesPath = resolveOptionalArg(rawArgs, "--resources-path")
  ?? (typeof process.resourcesPath === "string" ? process.resourcesPath : null);
const preflight = buildHelperPreflightAudit({ env });
const registrationPreflight = resolveHelperRegistrationPreflight(
  resolveHelperRegistrationPreflightInputFromEnv(env),
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
  return probeBin
    ? { ...process.env, [HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV]: probeBin }
    : process.env;
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
  if (!value) {
    throw new Error(`missing value for ${name}`);
  }

  return value;
}
