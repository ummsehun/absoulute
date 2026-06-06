/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  resolveNativeHelperScanPlan,
  resolveNativeSameDeviceOnly,
  resolveNativeVolumePlan,
} from "../../src/main/services/scan/nativeScanOrchestrator";

describe("nativeScanOrchestrator", () => {
  it("allows filesystem-root scans to cross mounted system volumes", () => {
    expect(resolveNativeSameDeviceOnly({ rootPath: "/" })).toBe(false);
  });

  it("keeps normal directory scans scoped to the same device", () => {
    expect(resolveNativeSameDeviceOnly({ rootPath: "/Users/tester" })).toBe(true);
  });

  it("plans filesystem root scans as explicit root cross-device scans", () => {
    expect(resolveNativeVolumePlan({ rootPath: "/" }, "darwin")).toMatchObject({
      rootKind: "filesystem-root",
      volumePolicy: "root-cross-device",
      sameDeviceOnly: false,
      plannedRoots: ["/"],
    });
  });

  it("plans data volume scans as explicit volume scans", () => {
    expect(
      resolveNativeVolumePlan({ rootPath: "/System/Volumes/Data" }, "darwin"),
    ).toMatchObject({
      rootKind: "data-volume",
      volumePolicy: "explicit-volumes",
      sameDeviceOnly: true,
      plannedRoots: ["/System/Volumes/Data"],
    });
  });

  it("plans external volume scans as explicit volume scans", () => {
    expect(resolveNativeVolumePlan({ rootPath: "/Volumes/Archive" }, "darwin")).toMatchObject({
      rootKind: "external-volume",
      volumePolicy: "explicit-volumes",
      sameDeviceOnly: true,
      plannedRoots: ["/Volumes/Archive"],
    });
  });

  it("plans normal directory scans as same-device scans", () => {
    expect(resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin")).toMatchObject({
      rootKind: "directory",
      volumePolicy: "same-device",
      sameDeviceOnly: true,
      plannedRoots: ["/Users/tester"],
    });
  });

  it("plans helper only when exact deep scans have an available helper", () => {
    expect(
      resolveNativeHelperScanPlan({
        platform: "darwin",
        stage: "deep",
        options: {
          accuracyMode: "full",
          deepPolicyPreset: "exact",
        },
        helperStatus: {
          available: true,
          transport: "xpc",
        },
      }),
    ).toEqual({ engine: "helper" });
  });

  it("plans native fallback when the helper is unavailable", () => {
    expect(
      resolveNativeHelperScanPlan({
        platform: "darwin",
        stage: "deep",
        options: {
          accuracyMode: "full",
          deepPolicyPreset: "exact",
        },
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
