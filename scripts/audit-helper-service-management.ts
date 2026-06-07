import {
  buildHelperServiceManagementAudit,
  HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV,
} from "../src/main/services/helper/macosServiceManagementProbe";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const rawArgs = process.argv.slice(2);
const outputPath = resolveAuditOutputPath(rawArgs);
const audit = await buildHelperServiceManagementAudit({
  env: buildAuditEnv(rawArgs),
  platform: resolvePlatform(rawArgs),
  resourcesPath: resolveOptionalArg(rawArgs, "--resources-path"),
});
const auditJson = JSON.stringify(audit, null, 2);

console.log(auditJson);
writeAuditOutputFile(outputPath, auditJson);

if (audit.status !== "ready") {
  process.exitCode = 1;
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
