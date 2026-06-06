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
  return {
    state: "not-implemented",
    reason,
    checks: {
      "service-management": "unknown",
      "helper-install": "unknown",
      "caller-identity": "unknown",
      "full-disk-access": "unknown",
      "xpc-channel": "fail",
    },
  };
}
