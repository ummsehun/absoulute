import { buildHelperReadinessReport } from "../src/main/services/helper/helperReadinessAudit";
import { buildHelperPreflightAudit } from "../src/main/services/helper/helperPreflightAudit";
import {
  resolveHelperRegistrationPreflight,
  resolveHelperRegistrationPreflightInputFromEnv,
} from "../src/main/services/helper/helperRegistration";
import { createMacOsServiceManagementProbeFromEnv } from "../src/main/services/helper/macosServiceManagementProbe";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const auditOutputPath = resolveAuditOutputPath(process.argv.slice(2));
const preflight = buildHelperPreflightAudit({ env: process.env });
const registrationPreflight = resolveHelperRegistrationPreflight(
  resolveHelperRegistrationPreflightInputFromEnv(process.env),
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
      process.env,
      process.platform,
      typeof process.resourcesPath === "string" ? process.resourcesPath : null,
    );
    const status = await probe.getStatus();
    return status.state;
  } catch {
    return "unknown";
  }
}
