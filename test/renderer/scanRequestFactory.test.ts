import { describe, expect, it } from "vitest";
import { buildDefaultScanRequest, buildExactScanRequest } from "../../src/renderer/src/hooks/scanRequestFactory";

describe("scanRequestFactory", () => {
  it("builds folder-only blacklist requests for the default scan path", () => {
    const request = buildDefaultScanRequest({
      rootPath: "/Users/user",
      optInProtected: false,
      responsivePolicySkips: true,
    });

    expect(request).toMatchObject({
      rootPath: "/Users/user",
      optInProtected: false,
      performanceProfile: "preview-first",
      scanMode: "native_rust",
      accuracyMode: "preview",
      deepPolicyPreset: "responsive",
      elevationPolicy: "manual",
      allowNodeFallback: false,
      responsivePolicySkips: true,
    });
  });

  it("keeps explicit exact rechecks separate from the default scan", () => {
    const defaultReq = buildDefaultScanRequest({ rootPath: "/Users/user", optInProtected: false });
    const exactReq = buildExactScanRequest({ rootPath: "/Users/user", optInProtected: false });
    expect(defaultReq.deepPolicyPreset).toBe("responsive");
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
