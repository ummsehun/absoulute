/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { resolveScanOptions } from "../../src/main/services/scan/scanRuntimeOptions";

describe("scanRuntimeOptions", () => {
  const rootPath = "/Users/tester/Projects/sample-app";

  it("canonicalizes responsive scans to preview semantics", () => {
    const options = resolveScanOptions(
      {
        rootPath,
        optInProtected: false,
        accuracyMode: "full",
        deepPolicyPreset: "responsive",
      },
      rootPath,
    );

    expect(options.deepPolicyPreset).toBe("responsive");
    expect(options.accuracyMode).toBe("preview");
    expect(options.performanceProfile).toBe("preview-first");
  });

  it("canonicalizes exact scans to full traversal semantics", () => {
    const options = resolveScanOptions(
      {
        rootPath,
        optInProtected: false,
        accuracyMode: "preview",
        deepPolicyPreset: "exact",
      },
      rootPath,
    );

    expect(options.deepPolicyPreset).toBe("exact");
    expect(options.accuracyMode).toBe("full");
    expect(options.performanceProfile).toBe("accuracy-first");
  });

  it("treats accuracyMode=full without an explicit preset as exact", () => {
    const options = resolveScanOptions(
      {
        rootPath: "/Users/tester",
        optInProtected: false,
        accuracyMode: "full",
      },
      "/Users/tester",
    );

    expect(options.deepPolicyPreset).toBe("exact");
    expect(options.accuracyMode).toBe("full");
    expect(options.performanceProfile).toBe("accuracy-first");
  });
});
