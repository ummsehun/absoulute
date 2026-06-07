/* @vitest-environment node */

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectCpuHint,
  resolveNativeScannerBinaryPath,
} from "../../src/main/services/native/nativeScannerBinary";

describe("nativeScannerBinary", () => {
  it("prefers explicit SCAN_NATIVE_BIN when it exists", () => {
    const explicitPath = "/tmp/diskviz-scanner";

    expect(
      resolveNativeScannerBinaryPath({
        cwd: "/repo",
        envPath: explicitPath,
        exists: (candidate) => candidate === explicitPath,
        nodeEnv: "development",
        platform: "darwin",
        resourcesPath: null,
      }),
    ).toBe(explicitPath);
  });

  it("prefers debug binaries in development and release binaries in production", () => {
    const debugPath = path.resolve("/repo", "native", "scanner", "target", "debug", "diskviz-scanner");
    const releasePath = path.resolve("/repo", "native", "scanner", "target", "release", "diskviz-scanner");

    expect(
      resolveNativeScannerBinaryPath({
        cwd: "/repo",
        exists: (candidate) => candidate === debugPath || candidate === releasePath,
        nodeEnv: "development",
        platform: "darwin",
        resourcesPath: null,
      }),
    ).toBe(debugPath);

    expect(
      resolveNativeScannerBinaryPath({
        cwd: "/repo",
        exists: (candidate) => candidate === debugPath || candidate === releasePath,
        nodeEnv: "production",
        platform: "darwin",
        resourcesPath: null,
      }),
    ).toBe(releasePath);
  });

  it("falls back to bundled resources when development binaries are missing", () => {
    const bundledPath = path.resolve("/app/Resources", "bin", "scanner-macos");

    expect(
      resolveNativeScannerBinaryPath({
        cwd: "/repo",
        exists: (candidate) => candidate === bundledPath,
        nodeEnv: "production",
        platform: "darwin",
        resourcesPath: "/app/Resources",
      }),
    ).toBe(bundledPath);
  });

  it("reports cpu hints from explicit counts", () => {
    expect(detectCpuHint(0)).toBe("unknown");
    expect(detectCpuHint(2)).toBe("parallel-low");
    expect(detectCpuHint(4)).toBe("parallel-medium");
    expect(detectCpuHint(8)).toBe("parallel-high");
  });
});
