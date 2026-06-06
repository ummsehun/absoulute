/* @vitest-environment node */

import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendNativeScannerLog,
  getNativeScannerLogPath,
} from "../../src/main/services/diagnostics/nativeScannerLogger";

describe("nativeScannerLogger", () => {
  const originalScanLogDir = process.env.SCAN_LOG_DIR;

  afterEach(() => {
    if (originalScanLogDir === undefined) {
      delete process.env.SCAN_LOG_DIR;
    } else {
      process.env.SCAN_LOG_DIR = originalScanLogDir;
    }
  });

  it("writes native scanner diagnostic entries as json lines", async () => {
    const logDir = await fs.mkdtemp(
      path.join(process.cwd(), ".tmp-tests", "native-log-"),
    );
    process.env.SCAN_LOG_DIR = logDir;

    appendNativeScannerLog({
      event: "native_test_event",
      level: "error",
      scanId: "scan-log-test",
      stage: "deep",
      details: {
        rootPath: "/",
        raw: "Native scanner failed",
      },
    });

    const logPath = getNativeScannerLogPath();
    const content = await fs.readFile(logPath, "utf8");
    const lines = content.trim().split("\n");
    const parsed = JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown>;

    expect(logPath).toBe(path.join(logDir, "native-scanner.jsonl"));
    expect(parsed.event).toBe("native_test_event");
    expect(parsed.level).toBe("error");
    expect(parsed.scanId).toBe("scan-log-test");
    expect(parsed.stage).toBe("deep");
    expect(parsed.details).toMatchObject({
      rootPath: "/",
      raw: "Native scanner failed",
    });

    await fs.rm(logDir, { recursive: true, force: true });
  });
});
