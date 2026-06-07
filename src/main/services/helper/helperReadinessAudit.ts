import type {
  HelperRegistrationBlocker,
  HelperRegistrationPreflight,
} from "./helperRegistration";
import {
  DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
  HELPER_DESIGNATED_REQUIREMENT_ENV,
  HELPER_FDA_VALIDATION_MATRIX_READY_ENV,
  HELPER_PACKAGING_ENTITLEMENTS_READY_ENV,
  HELPER_PRIVILEGED_EXECUTABLE_READY_ENV,
  HELPER_TEAM_ID_ENV,
} from "./helperRegistration";
import {
  HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV,
  MACOS_SERVICE_MANAGEMENT_PROBE_BINARY_NAME,
} from "./macosServiceManagementProbe";

export interface HelperReadinessReportInput {
  registrationPreflight: HelperRegistrationPreflight;
  fdaMatrixStatus: "ready" | "blocked";
  serviceManagementStatus:
    | "registered"
    | "not-installed"
    | "pending-approval"
    | "not-implemented"
    | "unknown";
}

export interface HelperReadinessReport {
  status: "ready" | "blocked";
  canEnableHelperByDefault: boolean;
  blockers: string[];
  evidence: HelperReadinessEvidence[];
  serviceManagementStatus: HelperReadinessReportInput["serviceManagementStatus"];
}

export interface HelperReadinessEvidence {
  guidance?: HelperReadinessEvidenceGuidance;
  key: string;
  status: "pass" | "fail" | "unknown";
  reason: string;
}

export interface HelperReadinessEvidenceGuidance {
  description: string;
  requiredArtifacts?: string[];
  requiredInputs?: string[];
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
    guidance: guidanceForEvidenceKey("service-management"),
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
    guidance: guidanceForEvidenceKey(key),
    key,
    status: "fail",
    reason: blocker,
  };
}

function guidanceForEvidenceKey(
  key: string,
): HelperReadinessEvidenceGuidance | undefined {
  const guidance: Record<string, HelperReadinessEvidenceGuidance> = {
    "designated-requirement": {
      description:
        "Set the expected production app designated requirement derived from the signing identity.",
      requiredInputs: [HELPER_DESIGNATED_REQUIREMENT_ENV],
    },
    "fda-validation-matrix": {
      description:
        "Provide a complete FDA validation matrix for the target macOS version.",
      requiredArtifacts: [DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH],
      requiredInputs: [HELPER_FDA_VALIDATION_MATRIX_READY_ENV],
    },
    "listener-requirement": {
      description:
        "Generate listener requirement metadata from the configured production Team ID.",
      requiredArtifacts: [
        DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
      ],
    },
    "packaging-entitlements": {
      description:
        "Confirm hardened runtime and entitlement files are wired into macOS packaging.",
      requiredArtifacts: [
        "electron-builder.json",
        "resources/entitlements/mac.plist",
        "resources/entitlements/mac.inherit.plist",
      ],
      requiredInputs: [HELPER_PACKAGING_ENTITLEMENTS_READY_ENV],
    },
    "privileged-helper-executable": {
      description:
        "Build and package an executable Mach-O privileged helper artifact.",
      requiredArtifacts: [
        DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
      ],
      requiredInputs: [HELPER_PRIVILEGED_EXECUTABLE_READY_ENV],
    },
    "service-management": {
      description:
        "Provide ServiceManagement probe evidence showing the packaged helper is registered.",
      requiredArtifacts: [`resources/bin/${MACOS_SERVICE_MANAGEMENT_PROBE_BINARY_NAME}`],
      requiredInputs: [HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV],
    },
    "team-id": {
      description: "Set the production Apple Developer Team ID.",
      requiredInputs: [HELPER_TEAM_ID_ENV],
    },
  };

  return guidance[key];
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
