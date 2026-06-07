/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
  buildHelperCodeSigningRequirement,
} from "../../src/main/services/helper/helperRegistration";

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

  it("uses explicit identity options for preflight evidence", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-preflight-script-identity-"),
    );
    const metadataPath = path.join(
      projectRoot,
      DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
    );
    const teamId = "ABCDE12345";
    const appBundleId = "com.acme.diskvisualizer";
    const requirement = buildHelperCodeSigningRequirement(teamId, appBundleId);

    try {
      fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
      fs.writeFileSync(
        metadataPath,
        JSON.stringify({
          ready: true,
          requirement,
          teamId,
        }),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-preflight.ts",
          "--project-root",
          projectRoot,
          "--app-bundle-id",
          appBundleId,
          "--team-id",
          teamId,
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
      const audit = JSON.parse(result.stdout);
      expect(audit.status).toBe("blocked");
      expect(audit.blockers).not.toContain("team-id-missing");
      expect(audit.blockers).not.toContain("designated-requirement-missing");
      expect(audit.blockers).not.toContain(
        "privileged-helper-listener-requirement-missing",
      );
      expect(audit.confirmations).toMatchObject({
        designatedRequirement: true,
        privilegedHelperListenerRequirement: true,
        teamId: true,
      });
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("uses explicit artifact confirmation flags", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-preflight.ts",
        "--project-root",
        process.cwd(),
        "--confirm-packaging-entitlements",
        "--confirm-privileged-helper-executable",
        "--confirm-helper-xpc-enumerate-bridge",
        "--confirm-fda-validation-matrix",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

      expect(result.status).toBe(0);
      const audit = JSON.parse(result.stdout);
      expect(audit.status).toBe("blocked");
      expect(audit.blockers).not.toContain("packaging-entitlements-missing");
    expect(audit.blockers).not.toContain("privileged-helper-executable-missing");
    expect(audit.blockers).not.toContain("helper-xpc-enumerate-bridge-missing");
    expect(audit.confirmations).toMatchObject({
      fdaValidationMatrix: true,
      helperXpcEnumerateBridge: true,
      packagingEntitlements: true,
      privilegedHelperExecutable: true,
    });
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

  it("fails explicitly when team id is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-preflight.ts",
        "--team-id",
        "--project-root",
        process.cwd(),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --team-id");
  });

  it("fails explicitly when app bundle id is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-preflight.ts",
        "--app-bundle-id",
        "--project-root",
        process.cwd(),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --app-bundle-id");
  });

  it("fails explicitly when designated requirement is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-preflight.ts",
        "--designated-requirement",
        "--project-root",
        process.cwd(),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --designated-requirement");
  });
});
