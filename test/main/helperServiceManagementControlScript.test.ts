/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("control-helper-service-management script", () => {
  it("requires explicit confirmation before invoking register", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-sm-control-confirm-"),
    );
    const markerPath = path.join(tempDir, "called");
    const probePath = writeProbe(tempDir, markerPath, "pending-approval");

    try {
      const result = runControl([
        "--operation",
        "register",
        "--platform",
        "darwin",
        "--probe-bin",
        probePath,
      ]);

      expect(result.status).toBe(1);
      expect(fs.existsSync(markerPath)).toBe(false);
      const output = JSON.parse(result.stdout);
      expect(output).toMatchObject({
        action: "register",
        confirmed: false,
        reason: "service-management-control-confirmation-required",
        status: "blocked",
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("blocks confirmed register before install preflight evidence is ready", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-sm-control-preflight-"),
    );
    const markerPath = path.join(tempDir, "called");
    const probePath = writeProbe(tempDir, markerPath, "pending-approval");

    try {
      const result = runControl([
        "--operation",
        "register",
        "--confirm",
        "--platform",
        "darwin",
        "--probe-bin",
        probePath,
        "--project-root",
        tempDir,
      ]);

      expect(result.status).toBe(1);
      expect(fs.existsSync(markerPath)).toBe(false);
      const output = JSON.parse(result.stdout);
      expect(output).toMatchObject({
        action: "register",
        confirmed: true,
        reason: "registration-install-preflight-blocked",
        status: "blocked",
      });
      expect(output.installBlockers).toContain("team-id-missing");
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("invokes confirmed unregister and reports the controller result", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-sm-control-unregister-"),
    );
    const markerPath = path.join(tempDir, "called");
    const probePath = writeProbe(tempDir, markerPath, "not-installed");

    try {
      const result = runControl([
        "--operation",
        "unregister",
        "--confirm",
        "--platform",
        "darwin",
        "--probe-bin",
        probePath,
      ]);

      expect(result.status).toBe(0);
      expect(fs.readFileSync(markerPath, "utf8")).toBe("unregister");
      const output = JSON.parse(result.stdout);
      expect(output).toMatchObject({
        action: "unregister",
        confirmed: true,
        result: {
          reason: "unregister-succeeded",
          state: "not-installed",
        },
        status: "ready",
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

function runControl(args: string[]) {
  return spawnSync(
    "bun",
    ["run", "scripts/control-helper-service-management.ts", ...args],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    },
  );
}

function writeProbe(
  tempDir: string,
  markerPath: string,
  state: "not-installed" | "pending-approval",
): string {
  const probePath = path.join(tempDir, "sm-control-probe");
  fs.writeFileSync(
    probePath,
    [
      "#!/bin/sh",
      `printf '%s' "$1" > ${JSON.stringify(markerPath)}`,
      "case \"$1\" in",
      "  register)",
      "    printf '%s\\n' '{\"state\":\"pending-approval\",\"reason\":\"register-succeeded\"}'",
      "    ;;",
      "  unregister)",
      "    printf '%s\\n' '{\"state\":\"not-installed\",\"reason\":\"unregister-succeeded\"}'",
      "    ;;",
      "  *)",
      `    printf '%s\\n' '{"state":"${state}","reason":"status"}'`,
      "    ;;",
      "esac",
      "",
    ].join("\n"),
  );
  fs.chmodSync(probePath, 0o755);
  return probePath;
}
