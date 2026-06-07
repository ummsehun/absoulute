import type { HelperRegistrationBlocker } from "./helperRegistration";

export type HelperLifecycleState =
  | "disabled"
  | "not-implemented"
  | "not-installed"
  | "pending-approval"
  | "not-authorized"
  | "ready";

export type HelperLifecycleCheck =
  | "service-management"
  | "helper-install"
  | "caller-identity"
  | "full-disk-access"
  | "xpc-channel";

export interface HelperLifecycleStatus {
  state: HelperLifecycleState;
  checks: Record<HelperLifecycleCheck, "pass" | "fail" | "unknown">;
  reason: string;
}

export interface MacOsXpcLifecycleInput {
  reason: string;
  registrationPreflight?: {
    blockers: HelperRegistrationBlocker[];
    status: "blocked" | "ready";
  };
  serviceManagement: {
    state: "not-implemented" | "not-installed" | "pending-approval" | "registered";
    reason: string;
  };
}

export function createDisabledHelperLifecycle(reason: string): HelperLifecycleStatus {
  return {
    state: "disabled",
    reason,
    checks: {
      "service-management": "unknown",
      "helper-install": "unknown",
      "caller-identity": "unknown",
      "full-disk-access": "unknown",
      "xpc-channel": "unknown",
    },
  };
}

export function createMacOsXpcStubLifecycle(reason: string): HelperLifecycleStatus {
  return createMacOsXpcLifecycle({
    reason,
    serviceManagement: {
      state: "not-implemented",
      reason,
    },
  });
}

export function createMacOsXpcLifecycle(
  input: MacOsXpcLifecycleInput,
): HelperLifecycleStatus {
  const preflightBlockers = input.registrationPreflight?.blockers ?? [];
  const preflightBlocked =
    input.serviceManagement.state === "registered"
    && input.registrationPreflight?.status === "blocked";
  const preflightReady = input.registrationPreflight?.status === "ready";
  const reason = preflightBlocked
    ? `registration-preflight-blocked:${preflightBlockers.join(",")}`
    : input.reason;

  return {
    state: preflightBlocked
      ? "not-authorized"
      : resolveMacOsXpcLifecycleState(input.serviceManagement.state),
    reason,
    checks: {
      "service-management": input.serviceManagement.state === "registered"
        ? "pass"
        : "fail",
      "helper-install": input.serviceManagement.state === "registered"
        ? "pass"
        : "unknown",
      "caller-identity": preflightBlocked
        ? resolveCallerIdentityCheck(preflightBlockers)
        : preflightReady ? "pass" : "unknown",
      "full-disk-access": preflightBlocked
        ? resolveFullDiskAccessCheck(preflightBlockers)
        : preflightReady ? "pass" : "unknown",
      "xpc-channel": preflightBlocked ? "unknown" : "fail",
    },
  };
}

function resolveCallerIdentityCheck(
  blockers: NonNullable<MacOsXpcLifecycleInput["registrationPreflight"]>["blockers"],
): "pass" | "fail" | "unknown" {
  if (blockers.includes("team-id-missing")
    || blockers.includes("designated-requirement-missing")) {
    return "fail";
  }

  return blockers.length > 0 ? "pass" : "unknown";
}

function resolveFullDiskAccessCheck(
  blockers: NonNullable<MacOsXpcLifecycleInput["registrationPreflight"]>["blockers"],
): "pass" | "fail" | "unknown" {
  if (blockers.includes("fda-validation-matrix-missing")) {
    return "fail";
  }

  return blockers.length > 0 ? "pass" : "unknown";
}

function resolveMacOsXpcLifecycleState(
  serviceManagementState: MacOsXpcLifecycleInput["serviceManagement"]["state"],
): HelperLifecycleState {
  switch (serviceManagementState) {
    case "registered":
      return "not-implemented";
    case "pending-approval":
      return "pending-approval";
    case "not-installed":
      return "not-installed";
    case "not-implemented":
      return "not-implemented";
  }
}
