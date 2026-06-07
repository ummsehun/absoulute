/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH } from "../../src/main/services/helper/helperRegistration";

describe("audit-helper-preflight script", () => {
  it("uses an explicit project root for preflight evidence", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-preflight-script-"),
    );
    const metadataPath = path.join(
      projectRoot,
      DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
    );
    const outputPath = path.join(projectRoot, "out", "preflight.json");

    try {
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      const requirement =
        'identifier "com.example.diskvisualizer.test-root" and anchor apple generic and certificate leaf[subject.OU] = "TESTROOT99"';
      fs.writeFileSync(
        metadataPath,
        JSON.stringify({
          ready: false,
          requirement,
          teamId: "TESTROOT99",
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-preflight.ts",
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

      expect(result.status).toBe(0);
      const stdoutAudit = JSON.parse(result.stdout);
      const fileAudit = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      expect(fileAudit).toEqual(stdoutAudit);
      expect(stdoutAudit.status).toBe("blocked");
      expect(
        stdoutAudit.details.privilegedHelperListenerRequirement,
      ).toEqual({
        metadataFound: true,
        ready: false,
        requirement,
        teamId: "TESTROOT99",
      });
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("fails explicitly when project root is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-preflight.ts", "--project-root"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --project-root");
  });

  it("fails explicitly when project root is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-preflight.ts",
        "--project-root",
        "--out",
        "/tmp/preflight.json",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --project-root");
  });
});
