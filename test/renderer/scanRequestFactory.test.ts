import { describe, expect, it } from "vitest";
import { buildDefaultScanRequest, buildExactScanRequest } from "../../src/renderer/src/hooks/scanRequestFactory";

describe("scanRequestFactory", () => {
  it("builds exact requests for the default scan path", () => {
    const request = buildDefaultScanRequest({
      rootPath: "/Users/user",
      optInProtected: false,
    });

    expect(request).toMatchObject({
      rootPath: "/Users/user",
      optInProtected: false,
      performanceProfile: "accuracy-first",
      scanMode: "native_rust",
      accuracyMode: "full",
      deepPolicyPreset: "exact",
      elevationPolicy: "manual",
      allowNodeFallback: false,
    });
  });

  it("default and exact scans both use exact deepPolicyPreset", () => {
    const defaultReq = buildDefaultScanRequest({ rootPath: "/Users/user", optInProtected: false });
    const exactReq = buildExactScanRequest({ rootPath: "/Users/user", optInProtected: false });
    expect(defaultReq.deepPolicyPreset).toBe("exact");
    expect(exactReq.deepPolicyPreset).toBe("exact");
  });

  it("builds exact requests only for explicit exact rechecks", () => {
    const request = buildExactScanRequest({
      rootPath: "/Users/user",
      optInProtected: false,
    });

    expect(request).toMatchObject({
      rootPath: "/Users/user",
      optInProtected: false,
      performanceProfile: "accuracy-first",
      scanMode: "native_rust",
      accuracyMode: "full",
      deepPolicyPreset: "exact",
      elevationPolicy: "manual",
      allowNodeFallback: false,
    });
  });
});
