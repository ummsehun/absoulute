import {
  buildHelperPreflightAudit,
  resolveHelperPreflightAuditStrictMode,
  resolveHelperPreflightAuditStrictExitCode,
} from "../src/main/services/helper/helperPreflightAudit";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const auditOutputPath = resolveAuditOutputPath(process.argv.slice(2));
const audit = buildHelperPreflightAudit({
  env: process.env,
  projectRoot: process.cwd(),
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
