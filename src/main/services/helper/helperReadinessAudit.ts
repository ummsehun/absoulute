import type {
  HelperPreflightAuditEvidence,
} from "./helperPreflightAudit";
import type {
  HelperRegistrationBlocker,
  HelperRegistrationPreflight,
} from "./helperRegistration";
import {
  DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
  HELPER_DESIGNATED_REQUIREMENT_ENV,
  HELPER_FDA_VALIDATION_MATRIX_READY_ENV,
  HELPER_PACKAGING_ENTITLEMENTS_READY_ENV,
  HELPER_PRIVILEGED_EXECUTABLE_READY_ENV,
  HELPER_TEAM_ID_ENV,
  HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV,
} from "./helperRegistration";
import {
  HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV,
  MACOS_SERVICE_MANAGEMENT_PROBE_BINARY_NAME,
} from "./macosServiceManagementProbe";

export interface HelperReadinessReportInput {
  registrationPreflight: HelperRegistrationPreflight;
  preflightEvidence?: HelperReadinessPreflightEvidenceState;
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
  artifactReady?: boolean;
  confirmationReady?: boolean;
  effectiveReady?: boolean;
  guidance?: HelperReadinessEvidenceGuidance;
  key: string;
  status: "pass" | "fail" | "unknown";
  reason: string;
}

export interface HelperReadinessPreflightEvidenceState {
  artifactEvidence: HelperPreflightAuditEvidence;
  confirmations: HelperPreflightAuditEvidence;
  effectiveEvidence: HelperPreflightAuditEvidence;
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
  const failedEvidence = [...blockers]
    .map((blocker) => evidenceForBlocker(input, blocker))
    .filter((item): item is HelperReadinessEvidence => item !== null);
  const failedKeys = new Set(failedEvidence.map((item) => item.key));
  const evidence = [
    ...failedEvidence,
    ...(blockers.size === 0
      ? passEvidenceForReadyPreflightKeys(input, failedKeys)
      : []),
  ];

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

function passEvidenceForReadyPreflightKeys(
  input: HelperReadinessReportInput,
  failedKeys: Set<string>,
): HelperReadinessEvidence[] {
  const keys = [
    "designated-requirement",
    "fda-validation-matrix",
    "listener-requirement",
    "packaging-entitlements",
    "privileged-helper-executable",
    "team-id",
    "xpc-enumerate-bridge",
  ];

  return keys
    .filter((key) => !failedKeys.has(key))
    .map((key) => ({
      ...preflightEvidenceStateForKey(input, key),
      guidance: guidanceForEvidenceKey(key),
      key,
      status: "pass" as const,
      reason: "ready",
    }));
}

function evidenceForBlocker(
  input: HelperReadinessReportInput,
  blocker: string,
): HelperReadinessEvidence | null {
  const key = blockerEvidenceKey(blocker);
  if (!key) {
    return null;
  }

  return {
    ...preflightEvidenceStateForKey(input, key),
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
    "xpc-enumerate-bridge": {
      description:
        "Build and package the app-side XPC enumerate bridge command.",
      requiredArtifacts: [
        DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
      ],
      requiredInputs: [HELPER_XPC_ENUMERATE_BRIDGE_READY_ENV],
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
    "helper-xpc-enumerate-bridge-missing": "xpc-enumerate-bridge",
    "packaging-entitlements-missing": "packaging-entitlements",
    "privileged-helper-executable-missing": "privileged-helper-executable",
    "privileged-helper-listener-requirement-missing": "listener-requirement",
    "team-id-missing": "team-id",
  };

  return evidenceKeys[blocker as HelperRegistrationBlocker] ?? null;
}

function preflightEvidenceStateForKey(
  input: HelperReadinessReportInput,
  key: string,
): Pick<
  HelperReadinessEvidence,
  "artifactReady" | "confirmationReady" | "effectiveReady"
> {
  const field = preflightEvidenceFieldForKey(key);
  if (!field || !input.preflightEvidence) {
    return {};
  }

  return {
    artifactReady: input.preflightEvidence.artifactEvidence[field],
    confirmationReady: input.preflightEvidence.confirmations[field],
    effectiveReady: input.preflightEvidence.effectiveEvidence[field],
  };
}

function preflightEvidenceFieldForKey(
  key: string,
): keyof HelperPreflightAuditEvidence | null {
  const fields: Record<string, keyof HelperPreflightAuditEvidence> = {
    "designated-requirement": "designatedRequirement",
    "fda-validation-matrix": "fdaValidationMatrix",
    "listener-requirement": "privilegedHelperListenerRequirement",
    "packaging-entitlements": "packagingEntitlements",
    "privileged-helper-executable": "privilegedHelperExecutable",
    "team-id": "teamId",
    "xpc-enumerate-bridge": "helperXpcEnumerateBridge",
  };

  return fields[key] ?? null;
}
