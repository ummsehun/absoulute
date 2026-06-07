import {
  buildHelperPreflightAudit,
  resolveHelperPreflightAuditStrictMode,
  resolveHelperPreflightAuditStrictExitCode,
} from "../src/main/services/helper/helperPreflightAudit";
import {
  HELPER_DESIGNATED_REQUIREMENT_ENV,
  HELPER_FDA_VALIDATION_MATRIX_READY_ENV,
  HELPER_PACKAGING_ENTITLEMENTS_READY_ENV,
  HELPER_PRIVILEGED_EXECUTABLE_READY_ENV,
  HELPER_TEAM_ID_ENV,
  HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV,
} from "../src/main/services/helper/helperRegistration";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const rawArgs = process.argv.slice(2);
const auditOutputPath = resolveAuditOutputPath(rawArgs);
const audit = buildHelperPreflightAudit({
  env: buildAuditEnv(rawArgs),
  projectRoot: resolveOptionalArg(rawArgs, "--project-root") ?? process.cwd(),
});
const auditJson = JSON.stringify(audit, null, 2);

console.log(auditJson);
writeAuditOutputFile(auditOutputPath, auditJson);

if (process.env.SCAN_HELPER_PREFLIGHT_AUDIT_STRICT === "1") {
  process.exitCode = resolveHelperPreflightAuditStrictExitCode(
    audit,
    resolveHelperPreflightAuditStrictMode(
      process.env.SCAN_HELPER_PREFLIGHT_AUDIT_STRICT_MODE,
    ),
  );
}

function buildAuditEnv(rawArgs: string[]): NodeJS.ProcessEnv {
  const teamId = resolveOptionalArg(rawArgs, "--team-id");
  const designatedRequirement = resolveOptionalArg(
    rawArgs,
    "--designated-requirement",
  );

  return {
    ...process.env,
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
