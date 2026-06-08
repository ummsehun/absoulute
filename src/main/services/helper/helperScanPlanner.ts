import type { ScanAccuracyMode, ScanDeepPolicyPreset } from "../../../types/contracts";
import type { HelperClientStatus } from "./helperClient";

export type HelperScanStage = "quick" | "deep";

export type HelperScanPlan =
  | {
      engine: "helper";
      reason?: undefined;
    }
  | {
      engine: "native";
      reason: HelperFallbackReason;
    };

export type HelperFallbackReason =
  | "non-darwin-platform"
  | "quick-stage"
  | "non-exact-scan"
  | "registration-preflight-blocked"
  | "helper-unavailable";

export interface ResolveHelperScanPlanInput {
  platform: NodeJS.Platform;
  stage: HelperScanStage;
  options: {
    accuracyMode: ScanAccuracyMode;
    deepPolicyPreset: ScanDeepPolicyPreset;
  };
  helperStatus: HelperClientStatus;
  helperPrototypeEnumerate?: boolean;
}

export function resolveHelperScanPlan(
  input: ResolveHelperScanPlanInput,
): HelperScanPlan {
  if (input.platform !== "darwin") {
    return {
      engine: "native",
      reason: "non-darwin-platform",
    };
  }

  if (input.stage !== "deep") {
    return {
      engine: "native",
      reason: "quick-stage",
    };
  }

  if (
    input.helperPrototypeEnumerate === true
    && input.helperStatus.transport === "xpc"
  ) {
    return { engine: "helper" };
  }

  if (
    input.options.accuracyMode !== "full"
    || input.options.deepPolicyPreset !== "exact"
  ) {
    return {
      engine: "native",
      reason: "non-exact-scan",
    };
  }

  if (input.helperStatus.registrationPreflight?.status === "blocked") {
    return {
      engine: "native",
      reason: "registration-preflight-blocked",
    };
  }

  if (!input.helperStatus.available) {
    if (
      input.helperPrototypeEnumerate === true
      && input.helperStatus.transport === "xpc"
    ) {
      return { engine: "helper" };
    }

    return {
      engine: "native",
      reason: "helper-unavailable",
    };
  }

  return { engine: "helper" };
}
