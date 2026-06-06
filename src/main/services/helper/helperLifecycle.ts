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
  return {
    state: resolveMacOsXpcLifecycleState(input.serviceManagement.state),
    reason: input.reason,
    checks: {
      "service-management": input.serviceManagement.state === "registered"
        ? "pass"
        : "fail",
      "helper-install": input.serviceManagement.state === "registered"
        ? "pass"
        : "unknown",
      "caller-identity": "unknown",
      "full-disk-access": "unknown",
      "xpc-channel": "fail",
    },
  };
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
