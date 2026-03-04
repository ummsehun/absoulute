import { describe, expect, it } from "vitest";

describe("renderer electronAPI mock", () => {
  it("injects window.electronAPI in test runtime", async () => {
    expect(window.electronAPI).toBeDefined();

    const result = await window.electronAPI.scanStart({
      rootPath: ".",
      optInProtected: false,
    });

    expect(result.ok).toBe(true);
  });
});
