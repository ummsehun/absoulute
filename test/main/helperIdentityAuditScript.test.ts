/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH } from "../../src/main/services/helper/helperRegistration";

describe("audit-helper-identity script", () => {
  it("writes blocked identity audit output to an explicit file", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-identity-audit-script-"),
    );
    const metadataPath = path.join(
      projectRoot,
      DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
    );
    const outputPath = path.join(projectRoot, "out", "identity-audit.json");

    try {
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      fs.writeFileSync(
        metadataPath,
        JSON.stringify({
          ready: false,
          requirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "TEAMID_NOT_CONFIGURED"',
          teamId: "TEAMID_NOT_CONFIGURED",
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-identity.ts",
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
      expect(fileAudit.listenerRequirementMetadataFound).toBe(true);
      expect(fileAudit.listenerRequirementReady).toBe(false);
      expect(fileAudit.blockers).toEqual([
        "team-id-missing",
        "designated-requirement-missing",
        "privileged-helper-listener-requirement-missing",
      ]);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("exits 0 when identity and listener metadata match", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-identity-audit-script-ready-"),
    );
    const metadataPath = path.join(
      projectRoot,
      DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
    );
    const requirement =
      'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"';

    try {
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      fs.writeFileSync(
        metadataPath,
        JSON.stringify({
          ready: true,
          requirement,
          teamId: "ABCDE12345",
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-identity.ts",
          "--project-root",
          projectRoot,
          "--team-id",
          "ABCDE12345",
          "--designated-requirement",
          requirement,
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
      expect(stdoutAudit.blockers).toEqual([]);
      expect(stdoutAudit.listenerRequirementReady).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("fails explicitly when team id is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-identity.ts", "--team-id"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --team-id");
  });

  it("uses the shared output path error when --out is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-identity.ts", "--out"],
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
