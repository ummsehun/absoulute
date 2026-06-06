import {
  buildHelperPreflightAudit,
  resolveHelperPreflightAuditStrictMode,
  resolveHelperPreflightAuditStrictExitCode,
} from "../src/main/services/helper/helperPreflightAudit";

const audit = buildHelperPreflightAudit({
  env: process.env,
  projectRoot: process.cwd(),
});

console.log(JSON.stringify(audit, null, 2));

if (process.env.SCAN_HELPER_PREFLIGHT_AUDIT_STRICT === "1") {
  process.exitCode = resolveHelperPreflightAuditStrictExitCode(
    audit,
    resolveHelperPreflightAuditStrictMode(
      process.env.SCAN_HELPER_PREFLIGHT_AUDIT_STRICT_MODE,
    ),
  );
}
