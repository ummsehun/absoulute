export type ScanSemanticMode = "preview" | "exact";
export type ScanPerformanceProfile = "balanced" | "preview-first" | "accuracy-first";
export type ScanAccuracyMode = "preview" | "full";
export type ScanDeepPolicyPreset = "responsive" | "exact";

export interface ScanIntentInput {
  performanceProfile?: ScanPerformanceProfile;
  accuracyMode?: ScanAccuracyMode;
  deepPolicyPreset?: ScanDeepPolicyPreset;
}

export interface CanonicalScanIntent {
  semanticMode: ScanSemanticMode;
  performanceProfile: "preview-first" | "accuracy-first";
  accuracyMode: ScanAccuracyMode;
  deepPolicyPreset: ScanDeepPolicyPreset;
  useCachedPreview: boolean;
  usesSoftSkipPolicy: boolean;
}

export function resolveScanIntent(input: ScanIntentInput = {}): CanonicalScanIntent {
  const semanticMode =
    input.deepPolicyPreset === "exact"
      ? "exact"
      : input.deepPolicyPreset === "responsive"
        ? "preview"
        : input.accuracyMode === "full"
      ? "exact"
      : "preview";

  if (semanticMode === "exact") {
    return {
      semanticMode,
      performanceProfile: "accuracy-first",
      accuracyMode: "full",
      deepPolicyPreset: "exact",
      useCachedPreview: false,
      usesSoftSkipPolicy: false,
    };
  }

  return {
    semanticMode,
    performanceProfile: "preview-first",
    accuracyMode: "preview",
    deepPolicyPreset: "responsive",
    useCachedPreview: true,
    usesSoftSkipPolicy: true,
  };
}
