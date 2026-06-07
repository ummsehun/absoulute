import {
  buildHelperPreflightAudit,
  resolveHelperPreflightAuditStrictMode,
  resolveHelperPreflightAuditStrictExitCode,
} from "../src/main/services/helper/helperPreflightAudit";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const rawArgs = process.argv.slice(2);
const auditOutputPath = resolveAuditOutputPath(rawArgs);
const audit = buildHelperPreflightAudit({
  env: process.env,
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
