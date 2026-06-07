import {
  buildHelperPreflightAudit,
} from "../src/main/services/helper/helperPreflightAudit";
import {
  HELPER_APP_BUNDLE_ID_ENV,
  HELPER_DESIGNATED_REQUIREMENT_ENV,
  HELPER_FDA_VALIDATION_MATRIX_READY_ENV,
  HELPER_PACKAGING_ENTITLEMENTS_READY_ENV,
  HELPER_PRIVILEGED_EXECUTABLE_READY_ENV,
  HELPER_TEAM_ID_ENV,
  HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV,
} from "../src/main/services/helper/helperRegistration";
import {
  createMacOsServiceManagementControllerFromEnv,
  HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV,
  type MacOsServiceManagementProbeResult,
} from "../src/main/services/helper/macosServiceManagementProbe";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

type ControlAction = "register" | "unregister";

interface ControlOutput {
  action: ControlAction;
  confirmed: boolean;
  installBlockers?: string[];
  reason: string;
  result?: MacOsServiceManagementProbeResult;
  status: "blocked" | "ready";
}

const rawArgs = process.argv.slice(2);
const outputPath = resolveAuditOutputPath(rawArgs);
const action = resolveAction(rawArgs);
const confirmed = rawArgs.includes("--confirm");
const env = buildControlEnv(rawArgs);
const platform = resolvePlatform(rawArgs);
const projectRoot = resolveOptionalArg(rawArgs, "--project-root")
  ?? process.cwd();
const resourcesPath = resolveOptionalArg(rawArgs, "--resources-path")
  ?? (typeof process.resourcesPath === "string" ? process.resourcesPath : null);

const output = await runControl();
const outputJson = JSON.stringify(output, null, 2);

console.log(outputJson);
writeAuditOutputFile(outputPath, outputJson);

if (output.status !== "ready") {
  process.exitCode = 1;
}

async function runControl(): Promise<ControlOutput> {
  if (!confirmed) {
    return {
      action,
      confirmed,
      reason: "service-management-control-confirmation-required",
      status: "blocked",
    };
  }

  if (action === "register") {
    const preflight = buildHelperPreflightAudit({ env, projectRoot });
    if (!preflight.readiness.installReady) {
      return {
        action,
        confirmed,
        installBlockers: preflight.readiness.installBlockers,
        reason: "registration-install-preflight-blocked",
        status: "blocked",
      };
    }
  }

  const controller = createMacOsServiceManagementControllerFromEnv(
    env,
    platform,
    resourcesPath,
  );
  if (!controller) {
    return {
      action,
      confirmed,
      reason: "service-management-control-unavailable",
      status: "blocked",
    };
  }

  const result = action === "register"
    ? await controller.register()
    : await controller.unregister();

  return {
    action,
    confirmed,
    reason: result.reason,
    result,
    status: result.state === "not-implemented" ? "blocked" : "ready",
  };
}

function buildControlEnv(rawArgs: string[]): NodeJS.ProcessEnv {
  const probeBin = resolveOptionalArg(rawArgs, "--probe-bin");
  const appBundleId = resolveOptionalArg(rawArgs, "--app-bundle-id");
  const teamId = resolveOptionalArg(rawArgs, "--team-id");
  const designatedRequirement = resolveOptionalArg(
    rawArgs,
    "--designated-requirement",
  );

  return {
    ...process.env,
    ...(probeBin ? { [HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV]: probeBin } : {}),
    ...(appBundleId ? { [HELPER_APP_BUNDLE_ID_ENV]: appBundleId } : {}),
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

function resolveAction(rawArgs: string[]): ControlAction {
  const operation = resolveOptionalArg(rawArgs, "--operation");
  if (operation === "register" || operation === "unregister") {
    return operation;
  }

  throw new Error("--operation must be register or unregister");
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
