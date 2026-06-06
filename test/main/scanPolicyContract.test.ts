/* @vitest-environment node */

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getScanTraversalContract,
  resolveDeepSoftSkipPolicyPrefixes,
} from "../../src/shared/domain/scanPolicyContract";

describe("scanPolicyContract", () => {
  it("publishes traversal skip constants from shared domain", () => {
    const contract = getScanTraversalContract();

    expect(contract.heavyDirectoryBasenames).toContain("node_modules");
    expect(contract.deepPackageSkipBasenames).toContain(".pnpm");
    expect(contract.bundleDirectorySuffixes).toContain(".app");
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
