import type {
  HelperRegistrationBlocker,
  HelperRegistrationPreflight,
} from "./helperRegistration";

export interface HelperReadinessReportInput {
  registrationPreflight: HelperRegistrationPreflight;
  fdaMatrixStatus: "ready" | "blocked";
  serviceManagementStatus: "registered" | "not-installed" | "unknown";
}

export interface HelperReadinessReport {
  status: "ready" | "blocked";
  canEnableHelperByDefault: boolean;
  blockers: string[];
  evidence: HelperReadinessEvidence[];
  serviceManagementStatus: HelperReadinessReportInput["serviceManagementStatus"];
}

export interface HelperReadinessEvidence {
  key: string;
  status: "pass" | "fail" | "unknown";
  reason: string;
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
    evidence: buildReadinessEvidence(input, blockers),
    serviceManagementStatus: input.serviceManagementStatus,
  };
}

function buildReadinessEvidence(
  input: HelperReadinessReportInput,
  blockers: Set<string>,
): HelperReadinessEvidence[] {
  const evidence = [...blockers]
    .map((blocker) => evidenceForBlocker(blocker))
    .filter((item): item is HelperReadinessEvidence => item !== null);

  evidence.push({
    key: "service-management",
    status: input.serviceManagementStatus === "registered" ? "pass" : "fail",
    reason: input.serviceManagementStatus === "registered"
      ? "registered"
      : `service-management-not-registered:${input.serviceManagementStatus}`,
  });

  return evidence.sort((left, right) => left.key.localeCompare(right.key));
}

function evidenceForBlocker(
  blocker: string,
): HelperReadinessEvidence | null {
  const key = blockerEvidenceKey(blocker);
  if (!key) {
    return null;
  }

  return {
    key,
    status: "fail",
    reason: blocker,
  };
}

function blockerEvidenceKey(
  blocker: string,
): string | null {
  const evidenceKeys: Record<HelperRegistrationBlocker, string> = {
    "designated-requirement-missing": "designated-requirement",
    "fda-validation-matrix-missing": "fda-validation-matrix",
    "packaging-entitlements-missing": "packaging-entitlements",
    "privileged-helper-executable-missing": "privileged-helper-executable",
    "privileged-helper-listener-requirement-missing": "listener-requirement",
    "team-id-missing": "team-id",
  };

  return evidenceKeys[blocker as HelperRegistrationBlocker] ?? null;
}
