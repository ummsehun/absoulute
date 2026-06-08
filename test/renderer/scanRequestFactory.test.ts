/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  buildDefaultScanRequest,
  buildExactScanRequest,
  buildPreviewScanRequest,
} from "../../src/renderer/src/hooks/scanRequestFactory";

describe("scanRequestFactory", () => {
  it("builds preview-first responsive requests for the default scan path", () => {
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

  it("keeps preview-first responsive requests available for explicit previews", () => {
    const request = buildPreviewScanRequest({
      rootPath: "/Users/user",
      optInProtected: false,
      responsivePolicySkips: false,
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
      responsivePolicySkips: false,
    });
  });

  it("builds exact requests only for explicit exact rechecks", () => {
    const request = buildExactScanRequest({
      rootPath: "/Users/user",
      optInProtected: true,
    });

    expect(request).toMatchObject({
      rootPath: "/Users/user",
      optInProtected: true,
      performanceProfile: "accuracy-first",
      scanMode: "native_rust",
      accuracyMode: "full",
      deepPolicyPreset: "exact",
      elevationPolicy: "manual",
      allowNodeFallback: false,
    });
  });
});
