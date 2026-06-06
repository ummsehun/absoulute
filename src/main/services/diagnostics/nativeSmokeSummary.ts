export interface NativeSmokeWarnings {
  permission: number;
  io: number;
  other: number;
}

export interface NativeSmokeRunSummary {
  label: "preview" | "exact";
  root: string;
  elapsedMs: number;
  reportedElapsedMs: number;
  estimated: boolean;
  scanned: number;
  blockedByPolicy: number;
  blockedByPermission: number;
  skippedByScope: number;
  softSkippedByPolicy: number;
  deferredByBudget: number;
  policySkipSamples: string[];
  permissionSamples: string[];
  scopeSkipSamples: string[];
  budgetDeferredSamples: string[];
  warnings: NativeSmokeWarnings;
}

export interface NativeSmokeComparisonSummary {
  root: string;
  preview: NativeSmokeRunSummary;
  exact: NativeSmokeRunSummary;
  exactScannedDelta: number;
  exactPolicySkipDelta: number;
  exactPermissionDelta: number;
  exactScopeDelta: number;
  previewEstimated: boolean;
  exactEstimated: boolean;
  exactHasResponsiveSkips: boolean;
  exactHasPermissionGaps: boolean;
  exactHasScopeGaps: boolean;
}

export function summarizeNativeSmokeComparison(
  preview: NativeSmokeRunSummary,
  exact: NativeSmokeRunSummary,
): NativeSmokeComparisonSummary {
  return {
    root: exact.root,
    preview,
    exact,
    exactScannedDelta: exact.scanned - preview.scanned,
    exactPolicySkipDelta: exact.blockedByPolicy - preview.blockedByPolicy,
    exactPermissionDelta: exact.blockedByPermission - preview.blockedByPermission,
    exactScopeDelta: exact.skippedByScope - preview.skippedByScope,
    previewEstimated: preview.estimated,
    exactEstimated: exact.estimated,
    exactHasResponsiveSkips:
      exact.softSkippedByPolicy > 0 ||
      exact.deferredByBudget > 0 ||
      exact.policySkipSamples.length > 0 ||
      exact.budgetDeferredSamples.length > 0,
    exactHasPermissionGaps:
      exact.blockedByPermission > 0 ||
      exact.permissionSamples.length > 0 ||
      exact.warnings.permission > 0,
    exactHasScopeGaps: exact.skippedByScope > 0 || exact.scopeSkipSamples.length > 0,
  };
}
