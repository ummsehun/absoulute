/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { resolveHelperScanPlan } from "../../src/main/services/helper/helperScanPlanner";

const helperAvailable = {
  available: true,
  transport: "xpc",
} as const;

const exactOptions = {
  accuracyMode: "full",
  deepPolicyPreset: "exact",
} as const;

describe("helperScanPlanner", () => {
  it("selects helper only for exact deep macOS scans with an available helper", () => {
    expect(
      resolveHelperScanPlan({
        platform: "darwin",
        stage: "deep",
        options: exactOptions,
        helperStatus: helperAvailable,
      }),
    ).toEqual({ engine: "helper" });
  });

  it("keeps quick stages on the native scanner", () => {
    expect(
      resolveHelperScanPlan({
        platform: "darwin",
        stage: "quick",
        options: exactOptions,
        helperStatus: helperAvailable,
      }),
    ).toEqual({
      engine: "native",
      reason: "quick-stage",
    });
  });

  it("keeps preview scans on the native scanner", () => {
    expect(
      resolveHelperScanPlan({
        platform: "darwin",
        stage: "deep",
        options: {
          accuracyMode: "preview",
          deepPolicyPreset: "responsive",
        },
        helperStatus: helperAvailable,
      }),
    ).toEqual({
      engine: "native",
      reason: "non-exact-scan",
    });
  });

  it("keeps non-macOS scans on the native scanner", () => {
    expect(
      resolveHelperScanPlan({
        platform: "linux",
        stage: "deep",
        options: exactOptions,
        helperStatus: helperAvailable,
      }),
    ).toEqual({
      engine: "native",
      reason: "non-darwin-platform",
    });
  });

  it("falls back when the helper is not available", () => {
    expect(
      resolveHelperScanPlan({
        platform: "darwin",
        stage: "deep",
        options: exactOptions,
        helperStatus: {
          available: false,
          reason: "helper-phase-gate-unresolved",
          transport: "disabled",
        },
      }),
    ).toEqual({
      engine: "native",
      reason: "helper-unavailable",
    });
  });
});
