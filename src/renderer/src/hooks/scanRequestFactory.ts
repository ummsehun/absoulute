import { resolveScanIntent } from "../../../shared/domain/scanIntent";
import type { ScanStartRequest } from "../../../types/contracts";

interface BuildScanRequestInput {
  optInProtected: boolean;
  rootPath: string;
}

export function buildDefaultScanRequest(input: BuildScanRequestInput): ScanStartRequest {
  return buildScanRequest(input, "exact");
}

export function buildPreviewScanRequest(input: BuildScanRequestInput): ScanStartRequest {
  return buildScanRequest(input, "responsive");
}

export function buildExactScanRequest(input: BuildScanRequestInput): ScanStartRequest {
  return buildScanRequest(input, "exact");
}

function buildScanRequest(
  input: BuildScanRequestInput,
  deepPolicyPreset: "responsive" | "exact",
): ScanStartRequest {
  const scanIntent = resolveScanIntent({ deepPolicyPreset });

  return {
    rootPath: input.rootPath,
    optInProtected: input.optInProtected,
    performanceProfile: scanIntent.performanceProfile,
    scanMode: "native_rust",
    accuracyMode: scanIntent.accuracyMode,
    deepPolicyPreset: scanIntent.deepPolicyPreset,
    elevationPolicy: "manual",
    emitPolicy: {
      aggBatchMaxItems: 512,
      aggBatchMaxMs: 120,
      progressIntervalMs: 120,
    },
    concurrencyPolicy: {
      min: 16,
      max: 64,
      adaptive: true,
    },
    allowNodeFallback: false,
  };
}
