/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("audit-helper-service-management script", () => {
  it("writes blocked ServiceManagement audit output to an explicit file", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-sm-audit-script-"),
    );
    const probePath = path.join(tempDir, "sm-probe");
    const outputPath = path.join(tempDir, "out", "sm-audit.json");

    try {
      fs.writeFileSync(
        probePath,
        "#!/bin/sh\nprintf '%s\\n' '{\"state\":\"not-installed\",\"reason\":\"not-registered\"}'\n",
      );
      fs.chmodSync(probePath, 0o755);

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-service-management.ts",
          "--platform",
          "darwin",
          "--probe-bin",
          probePath,
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
      expect(fileAudit).toEqual({
        platform: "darwin",
        probeBinaryPath: probePath,
        probeBinaryReady: true,
        serviceManagementReason: "not-registered",
        serviceManagementStatus: "not-installed",
        status: "blocked",
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("exits 0 when the probe reports registered ServiceManagement status", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-sm-audit-ready-"),
    );
    const probePath = path.join(tempDir, "sm-probe");

    try {
      fs.writeFileSync(
        probePath,
        "#!/bin/sh\nprintf '%s\\n' '{\"state\":\"registered\",\"reason\":\"enabled\"}'\n",
      );
      fs.chmodSync(probePath, 0o755);

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-service-management.ts",
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

      expect(result.status).toBe(0);
      const stdoutAudit = JSON.parse(result.stdout);
      expect(stdoutAudit).toEqual({
        platform: "darwin",
        probeBinaryPath: probePath,
        probeBinaryReady: true,
        serviceManagementReason: "enabled",
        serviceManagementStatus: "registered",
        status: "ready",
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails explicitly when probe bin is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-service-management.ts", "--probe-bin"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --probe-bin");
  });

  it("fails explicitly when resources path is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-service-management.ts",
        "--resources-path",
        "--not-a-path",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --resources-path");
  });

  it("fails explicitly when probe bin is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-service-management.ts",
        "--probe-bin",
        "--platform",
        "darwin",
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

  it("fails explicitly when platform is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-service-management.ts",
        "--platform",
        "--resources-path",
        "resources",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --platform");
  });

  it("uses the shared output path error when --out is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-service-management.ts", "--out"],
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
