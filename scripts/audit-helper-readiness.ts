import { buildHelperReadinessReport } from "../src/main/services/helper/helperReadinessAudit";
import {
  resolveHelperRegistrationPreflight,
  resolveHelperRegistrationPreflightInputFromEnv,
} from "../src/main/services/helper/helperRegistration";
import { createMacOsServiceManagementProbeFromEnv } from "../src/main/services/helper/macosServiceManagementProbe";

const registrationPreflight = resolveHelperRegistrationPreflight(
  resolveHelperRegistrationPreflightInputFromEnv(process.env),
);
const serviceManagementStatus = await resolveServiceManagementStatus();
const report = buildHelperReadinessReport({
  registrationPreflight,
  fdaMatrixStatus: registrationPreflight.blockers.includes(
    "fda-validation-matrix-missing",
  )
    ? "blocked"
    : "ready",
  serviceManagementStatus,
});

console.log(JSON.stringify(report, null, 2));

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
