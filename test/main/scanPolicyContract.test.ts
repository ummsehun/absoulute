/* @vitest-environment node */

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getScanTraversalContract,
  matchesSoftSkipPathRules,
  resolveDeepSoftSkipPolicyPrefixes,
} from "../../src/shared/domain/scanPolicyContract";

describe("scanPolicyContract", () => {
  it("publishes traversal skip constants from shared domain", () => {
    const contract = getScanTraversalContract();

    expect(contract.heavyDirectoryBasenames).toContain("node_modules");
    expect(contract.deepPackageSkipBasenames).toContain(".pnpm");
    expect(contract.bundleDirectorySuffixes).toContain(".app");
    expect(contract.softSkipPathRules.length).toBeGreaterThan(0);
  });

  it("matches shared responsive soft-skip path rules", () => {
    expect(
      matchesSoftSkipPathRules(
        "/Users/tester/.rustup/toolchains/stable/share/doc/rust/html",
      ),
    ).toBe(true);
    expect(
      matchesSoftSkipPathRules(
        "/Users/tester/Library/Application Support/Google/Chrome/Profile 1/Extensions/abc",
      ),
    ).toBe(true);
    expect(
      matchesSoftSkipPathRules(
        "/Users/tester/Library/Application Support/Firefox/Profiles/default/storage/default/site/cache2/entries",
      ),
    ).toBe(true);
    expect(
      matchesSoftSkipPathRules(
        "/Users/tester/Library/Application Support/Firefox/Profiles/default/bookmarks",
      ),
    ).toBe(false);
    expect(matchesSoftSkipPathRules("/Users/tester/Documents/report.pdf")).toBe(false);
  });

  it("resolves platform-aware responsive soft skip prefixes", () => {
    const prefixes = resolveDeepSoftSkipPolicyPrefixes(
      "darwin",
      "/Users/tester",
      true,
    );

    expect(prefixes).toContain(path.join("/Users/tester", "Library", "Caches"));
    expect(prefixes).toContain("/private/var/folders");
  });
});
