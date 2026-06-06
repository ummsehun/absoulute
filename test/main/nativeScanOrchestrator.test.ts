/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { resolveNativeSameDeviceOnly } from "../../src/main/services/scan/nativeScanOrchestrator";

describe("nativeScanOrchestrator", () => {
  it("allows filesystem-root scans to cross mounted system volumes", () => {
    expect(resolveNativeSameDeviceOnly({ rootPath: "/" })).toBe(false);
  });

  it("keeps normal directory scans scoped to the same device", () => {
    expect(resolveNativeSameDeviceOnly({ rootPath: "/Users/tester" })).toBe(true);
  });
});
