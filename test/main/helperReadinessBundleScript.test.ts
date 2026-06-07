/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH } from "../../src/main/services/helper/helperRegistration";

describe("audit-helper-readiness-bundle script", () => {
  it("writes blocked readiness bundle output to an explicit file", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-readiness-bundle-"),
    );
    const outputPath = path.join(projectRoot, "out", "bundle.json");

    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-readiness-bundle.ts",
          "--project-root",
          projectRoot,
          "--platform",
          "darwin",
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
      const stdoutBundle = JSON.parse(result.stdout);
      const fileBundle = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      expect(fileBundle).toEqual(stdoutBundle);
      expect(fileBundle.status).toBe("blocked");
      expect(fileBundle.canEnableHelperByDefault).toBe(false);
      expect(fileBundle.componentStatus.readiness).toBe("blocked");
      expect(fileBundle.blockers).toContain("service-management-not-registered");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("passes explicit identity and ServiceManagement probe options into the bundle", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-readiness-bundle-options-"),
    );
    const metadataPath = path.join(
      projectRoot,
      DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
    );
    const probePath = path.join(projectRoot, "sm-probe");
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
      fs.writeFileSync(
        probePath,
        "#!/bin/sh\nprintf '%s\\n' '{\"state\":\"registered\",\"reason\":\"enabled\"}'\n",
      );
      fs.chmodSync(probePath, 0o755);

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-readiness-bundle.ts",
          "--project-root",
          projectRoot,
          "--team-id",
          "ABCDE12345",
          "--designated-requirement",
          requirement,
          "--platform",
          "darwin",
          "--probe-bin",
          probePath,
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      const stdoutBundle = JSON.parse(result.stdout);
      expect(stdoutBundle.identity.status).toBe("ready");
      expect(stdoutBundle.identity.teamId).toBe("ABCDE12345");
      expect(stdoutBundle.identity.designatedRequirement).toBe(requirement);
      expect(stdoutBundle.serviceManagement.status).toBe("ready");
      expect(stdoutBundle.serviceManagement.probeBinaryPath).toBe(probePath);
      expect(stdoutBundle.componentStatus.identity).toBe("ready");
      expect(stdoutBundle.componentStatus.serviceManagement).toBe("ready");
      expect(stdoutBundle.status).toBe("blocked");
      expect(stdoutBundle.canEnableHelperByDefault).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("uses explicit artifact confirmation flags", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-readiness-bundle.ts",
        "--project-root",
        process.cwd(),
        "--platform",
        "darwin",
        "--resources-path",
        "resources",
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

    expect(result.status).toBe(1);
    const bundle = JSON.parse(result.stdout);
    expect(bundle.canEnableHelperByDefault).toBe(false);
    expect(bundle.blockers).not.toContain("packaging-entitlements-missing");
    expect(bundle.blockers).not.toContain("privileged-helper-executable-missing");
    expect(bundle.blockers).not.toContain("helper-xpc-enumerate-bridge-missing");
    expect(bundle.preflight.confirmations).toMatchObject({
      fdaValidationMatrix: true,
      helperXpcEnumerateBridge: true,
      packagingEntitlements: true,
      privilegedHelperExecutable: true,
    });
  });

  it("uses the shared output path error when --out is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-readiness-bundle.ts", "--out"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--out requires an output file path");
  });

  it("fails explicitly when project root is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-readiness-bundle.ts",
        "--project-root",
        "--team-id",
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
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-readiness-bundle-team-option-"),
    );

    try {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-readiness-bundle.ts",
        "--team-id",
        "--project-root",
        projectRoot,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --team-id");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("fails explicitly when designated requirement is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-readiness-bundle.ts",
        "--designated-requirement",
        "--platform",
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

  it("fails explicitly when probe binary is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-readiness-bundle.ts",
        "--probe-bin",
        "--resources-path",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --probe-bin");
  });
});
