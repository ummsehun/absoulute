import { buildHelperReadinessReport } from "../src/main/services/helper/helperReadinessAudit";
import {
  resolveHelperRegistrationPreflight,
  resolveHelperRegistrationPreflightInputFromEnv,
} from "../src/main/services/helper/helperRegistration";

const registrationPreflight = resolveHelperRegistrationPreflight(
  resolveHelperRegistrationPreflightInputFromEnv(process.env),
);
const report = buildHelperReadinessReport({
  registrationPreflight,
  fdaMatrixStatus: registrationPreflight.blockers.includes(
    "fda-validation-matrix-missing",
  )
    ? "blocked"
    : "ready",
  serviceManagementStatus: "unknown",
});

console.log(JSON.stringify(report, null, 2));

if (report.status !== "ready") {
  process.exitCode = 1;
}
