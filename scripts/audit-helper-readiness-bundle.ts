import { buildHelperReadinessBundle } from "../src/main/services/helper/helperReadinessBundle";
import { HELPER_PEER_VALIDATION_READY_ENV } from "../src/main/services/helper/helperReadinessAudit";
import {
  HELPER_FDA_VALIDATION_MATRIX_READY_ENV,
  HELPER_PACKAGING_ENTITLEMENTS_READY_ENV,
  HELPER_PRIVILEGED_EXECUTABLE_READY_ENV,
  HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV,
} from "../src/main/services/helper/helperRegistration";
import { HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV } from "../src/main/services/helper/macosServiceManagementProbe";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const rawArgs = process.argv.slice(2);
const outputPath = resolveAuditOutputPath(rawArgs);
const bundle = await buildHelperReadinessBundle({
  appBundleIdentifier: resolveOptionalArg(rawArgs, "--app-bundle-id"),
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
  return {
    ...process.env,
    ...(probeBin ? { [HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV]: probeBin } : {}),
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
    ...(hasFlag(rawArgs, "--confirm-peer-validation")
      ? { [HELPER_PEER_VALIDATION_READY_ENV]: "true" }
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
