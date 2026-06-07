/* @vitest-environment node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "../../scripts/helper-audit-output";

describe("helper audit output", () => {
  it("resolves explicit output paths", () => {
    expect(resolveAuditOutputPath(["--out", "/tmp/audit.json"])).toBe(
      "/tmp/audit.json",
    );
  });

  it("returns null when no output file is requested", () => {
    expect(resolveAuditOutputPath([])).toBeNull();
  });

  it("rejects --out without a file path", () => {
    expect(() => resolveAuditOutputPath(["--out"])).toThrow(
      "--out requires an output file path",
    );
  });

  it("rejects --out followed by another option", () => {
    expect(() => resolveAuditOutputPath(["--out", "--project-root"])).toThrow(
      "--out requires an output file path",
    );
  });

  it("writes JSON and creates parent directories", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-audit-output-"),
    );
    const outputPath = path.join(tempDir, "nested", "audit.json");

    try {
      writeAuditOutputFile(outputPath, "{\"status\":\"blocked\"}");

      expect(fs.readFileSync(outputPath, "utf8")).toBe(
        "{\"status\":\"blocked\"}\n",
      );
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
