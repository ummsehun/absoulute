/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  summarizeNativeSmokeComparison,
  type NativeSmokeRunSummary,
} from "../../src/main/services/diagnostics/nativeSmokeSummary";

describe("nativeSmokeSummary", () => {
  it("summarizes preview and exact smoke runs for comparison", () => {
    const preview: NativeSmokeRunSummary = {
      label: "preview",
      root: "/Users/user",
      elapsedMs: 120,
      reportedElapsedMs: 100,
      estimated: true,
      scanned: 10,
      blockedByPolicy: 4,
      blockedByPermission: 1,
      skippedByScope: 0,
      softSkippedByPolicy: 4,
      deferredByBudget: 2,
      policySkipSamples: ["/Users/user/Library/Caches"],
      permissionSamples: ["/Users/user/Library/Mail"],
      scopeSkipSamples: [],
      budgetDeferredSamples: ["/Users/user/Library/Application Support"],
      warnings: {
        permission: 1,
        io: 0,
        other: 0,
      },
    };
    const exact: NativeSmokeRunSummary = {
      label: "exact",
      root: "/Users/user",
      elapsedMs: 300,
      reportedElapsedMs: 280,
      estimated: false,
      scanned: 30,
      blockedByPolicy: 0,
      blockedByPermission: 1,
      skippedByScope: 0,
      softSkippedByPolicy: 0,
      deferredByBudget: 0,
      policySkipSamples: [],
      permissionSamples: ["/Users/user/Library/Mail"],
      scopeSkipSamples: [],
      budgetDeferredSamples: [],
      warnings: {
        permission: 1,
        io: 0,
        other: 0,
      },
    };

    expect(summarizeNativeSmokeComparison(preview, exact)).toMatchObject({
      root: "/Users/user",
      exactScannedDelta: 20,
      exactPolicySkipDelta: -4,
      exactPermissionDelta: 0,
      exactScopeDelta: 0,
      previewEstimated: true,
      exactEstimated: false,
      exactHasResponsiveSkips: false,
      exactHasPermissionGaps: true,
      exactHasScopeGaps: false,
    });
  });
});
