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
    expect(options.deepBudgetMs).toBe(0);
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
    expect(options.deepBudgetMs).toBe(0);
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
    expect(options.deepBudgetMs).toBe(0);
  });

  it("keeps responsive deep traversal unbounded for filesystem roots", () => {
    const rootOptions = resolveScanOptions(
      {
        rootPath: "/",
        optInProtected: false,
        deepPolicyPreset: "responsive",
      },
      "/",
    );
    const userOptions = resolveScanOptions(
      {
        rootPath: "/Users/tester",
        optInProtected: false,
        deepPolicyPreset: "responsive",
      },
      "/Users/tester",
    );

    expect(rootOptions.deepBudgetMs).toBe(0);
    expect(userOptions.deepBudgetMs).toBe(0);
  });

  it("applies folder-only blacklist soft-skips to filesystem roots", () => {
    const options = resolveScanOptions(
      {
        rootPath: "/",
        optInProtected: false,
        deepPolicyPreset: "responsive",
      },
      "/",
    );

    expect(options.deepSkipPackageManagers).toBe(true);
    expect(options.deepSkipCachePrefixes).toBe(true);
    expect(options.deepSkipBundleDirs).toBe(true);
    expect(options.deepSoftSkipPrefixes.length).toBeGreaterThan(0);
    expect(options.deepSkipDirSuffixes).toContain(".app");
  });

  it("allows responsive scans to disable policy soft-skips manually", () => {
    const options = resolveScanOptions(
      {
        rootPath,
        optInProtected: false,
        deepPolicyPreset: "responsive",
        responsivePolicySkips: false,
      },
      rootPath,
    );

    expect(options.deepPolicyPreset).toBe("responsive");
    expect(options.accuracyMode).toBe("preview");
    expect(options.deepBudgetMs).toBe(0);
    expect(options.deepSkipPackageManagers).toBe(false);
    expect(options.deepSkipCachePrefixes).toBe(false);
    expect(options.deepSkipBundleDirs).toBe(false);
    expect(options.deepSoftSkipPrefixes).toEqual([]);
    expect(options.deepSkipDirSuffixes).toEqual([]);
  });
});
