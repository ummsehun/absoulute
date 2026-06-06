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
  | "helper-unavailable";

export interface ResolveHelperScanPlanInput {
  platform: NodeJS.Platform;
  stage: HelperScanStage;
  options: {
    accuracyMode: ScanAccuracyMode;
    deepPolicyPreset: ScanDeepPolicyPreset;
  };
  helperStatus: HelperClientStatus;
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
    input.options.accuracyMode !== "full"
    || input.options.deepPolicyPreset !== "exact"
  ) {
    return {
      engine: "native",
      reason: "non-exact-scan",
    };
  }

  if (!input.helperStatus.available) {
    return {
      engine: "native",
      reason: "helper-unavailable",
    };
  }

  return { engine: "helper" };
}
