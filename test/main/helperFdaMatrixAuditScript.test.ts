/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS } from "../../src/main/services/helper/helperRegistration";

describe("audit-helper-fda-matrix script", () => {
  it("writes the blocked FDA matrix audit to an explicit output file", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-audit-script-"),
    );
    const matrixPath = path.join(
      projectRoot,
      "docs",
      "helper-fda-validation-matrix.json",
    );
    const outputPath = path.join(projectRoot, "out", "fda-audit.json");

    try {
      fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "pending",
          scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) => ({
            id,
            notes: `pending validation for ${id}`,
            status: "pending",
            validatedAt: null,
            validator: null,
          })),
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-fda-matrix.ts",
          "--project-root",
          projectRoot,
          "--out",
          outputPath,
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      const stdoutAudit = JSON.parse(result.stdout);
      const fileAudit = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      expect(fileAudit).toEqual(stdoutAudit);
      expect(fileAudit.status).toBe("blocked");
      expect(fileAudit.targetMacOSReady).toBe(false);
      expect(fileAudit.missingPassedScenarios).toEqual(
        DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS,
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("exits 0 for a ready FDA matrix under the selected project root", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-audit-script-ready-"),
    );
    const matrixPath = path.join(
      projectRoot,
      "docs",
      "helper-fda-validation-matrix.json",
    );

    try {
      fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "15.0",
          scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) => ({
            id,
            notes: `validated ${id} on macOS 15.0`,
            status: "passed",
            validatedAt: "2026-06-08T00:00:00.000Z",
            validator: "manual-fda-audit",
          })),
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-fda-matrix.ts",
          "--project-root",
          projectRoot,
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      const stdoutAudit = JSON.parse(result.stdout);
      expect(stdoutAudit.status).toBe("ready");
      expect(stdoutAudit.targetMacOSReady).toBe(true);
      expect(stdoutAudit.missingPassedScenarios).toEqual([]);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("fails explicitly when project root is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-fda-matrix.ts", "--project-root"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --project-root");
  });

  it("uses the shared output path error when --out is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-fda-matrix.ts", "--out"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--out requires an output file path");
  });
});
