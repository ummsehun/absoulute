import type { HelperRegistrationPreflight } from "./helperRegistration";

export interface HelperReadinessReportInput {
  registrationPreflight: HelperRegistrationPreflight;
  fdaMatrixStatus: "ready" | "blocked";
  serviceManagementStatus: "registered" | "not-installed" | "unknown";
}

export interface HelperReadinessReport {
  status: "ready" | "blocked";
  canEnableHelperByDefault: boolean;
  blockers: string[];
  serviceManagementStatus: HelperReadinessReportInput["serviceManagementStatus"];
}

export function buildHelperReadinessReport(
  input: HelperReadinessReportInput,
): HelperReadinessReport {
  const blockers = new Set<string>(input.registrationPreflight.blockers);
  if (input.fdaMatrixStatus !== "ready") {
    blockers.add("fda-validation-matrix-missing");
  }
  if (input.serviceManagementStatus !== "registered") {
    blockers.add("service-management-not-registered");
  }

  return {
    status: blockers.size === 0 ? "ready" : "blocked",
    canEnableHelperByDefault: false,
    blockers: [...blockers].sort(),
    serviceManagementStatus: input.serviceManagementStatus,
  };
}
