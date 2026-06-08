/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { resolveDefaultScanRoot } from "../../src/main/handler/registerIpcHandlers";

describe("resolveDefaultScanRoot", () => {
  it("uses the current user home on macOS instead of scanning all /Users by default", () => {
    expect(resolveDefaultScanRoot("darwin", "/Users/tester")).toBe("/Users/tester");
  });

  it("uses the current user home on non-macOS platforms", () => {
    expect(resolveDefaultScanRoot("linux", "/home/tester")).toBe("/home/tester");
  });
});
