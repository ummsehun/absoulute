import { buildHelperReadinessBundle } from "../src/main/services/helper/helperReadinessBundle";
import { HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV } from "../src/main/services/helper/macosServiceManagementProbe";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const rawArgs = process.argv.slice(2);
const outputPath = resolveAuditOutputPath(rawArgs);
const bundle = await buildHelperReadinessBundle({
  designatedRequirement: resolveOptionalArg(rawArgs, "--designated-requirement"),
  env: buildAuditEnv(rawArgs),
  platform: resolvePlatform(rawArgs),
  projectRoot: resolveOptionalArg(rawArgs, "--project-root"),
  resourcesPath: resolveOptionalArg(rawArgs, "--resources-path"),
  teamId: resolveOptionalArg(rawArgs, "--team-id"),
});
const bundleJson = JSON.stringify(bundle, null, 2);

console.log(bundleJson);
writeAuditOutputFile(outputPath, bundleJson);

if (bundle.status !== "ready") {
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
  if (!value || value.startsWith("--")) {
    throw new Error(`missing value for ${name}`);
  }

  return value;
}
