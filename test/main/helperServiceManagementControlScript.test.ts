/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME,
  DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS,
  DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
  buildHelperCodeSigningRequirement,
} from "../../src/main/services/helper/helperRegistration";

const controlScriptPath = path.join(
  process.cwd(),
  "scripts",
  "control-helper-service-management.ts",
);

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

  it("uses explicit preflight evidence options before confirmed register", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-sm-control-ready-preflight-"),
    );
    const markerPath = path.join(tempDir, "called");
    const probePath = writeProbe(tempDir, markerPath, "pending-approval");
    const appBundleId = "com.acme.diskvisualizer";
    const teamId = "ABCDE12345";
    const requirement = buildHelperCodeSigningRequirement(teamId, appBundleId);

    try {
      writeInstallReadyProject(tempDir, teamId, requirement);

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
        "--app-bundle-id",
        appBundleId,
        "--team-id",
        teamId,
        "--designated-requirement",
        requirement,
        "--confirm-packaging-entitlements",
        "--confirm-privileged-helper-executable",
        "--confirm-helper-xpc-enumerate-bridge",
        "--confirm-fda-validation-matrix",
      ]);

      expect(result.status).toBe(0);
      expect(fs.readFileSync(markerPath, "utf8")).toBe("register");
      const output = JSON.parse(result.stdout);
      expect(output).toMatchObject({
        action: "register",
        confirmed: true,
        reason: "register-succeeded",
        result: {
          reason: "register-succeeded",
          state: "pending-approval",
        },
        status: "ready",
      });
      expect(output.installBlockers).toBeUndefined();
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

  it("fails explicitly when project root is followed by another option", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-sm-control-project-root-option-"),
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
        "--resources-path",
        tempDir,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --project-root");
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when probe binary is followed by another option", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-sm-control-probe-bin-option-"),
    );

    try {
      const result = runControl([
        "--operation",
        "unregister",
        "--confirm",
        "--platform",
        "darwin",
        "--probe-bin",
        "--resources-path",
        tempDir,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing value for --probe-bin");
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("fails explicitly when team id is followed by another option", () => {
    const result = runControl([
      "--operation",
      "register",
      "--confirm",
      "--team-id",
      "--project-root",
      process.cwd(),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --team-id");
  });

  it("fails explicitly when app bundle id is followed by another option", () => {
    const result = runControl([
      "--operation",
      "register",
      "--confirm",
      "--app-bundle-id",
      "--project-root",
      process.cwd(),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --app-bundle-id");
  });

  it("fails explicitly when designated requirement is followed by another option", () => {
    const result = runControl([
      "--operation",
      "register",
      "--confirm",
      "--designated-requirement",
      "--project-root",
      process.cwd(),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --designated-requirement");
  });

  it("fails explicitly when output path is followed by another option", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-sm-control-out-option-"),
    );

    try {
      const result = runControl([
        "--operation",
        "unregister",
        "--confirm",
        "--platform",
        "darwin",
        "--out",
        "--resources-path",
        tempDir,
      ], tempDir);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("--out requires an output file path");
      expect(fs.existsSync(path.join(tempDir, "--resources-path"))).toBe(false);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

function runControl(args: string[], cwd = process.cwd()) {
  return spawnSync(
    "bun",
    ["run", controlScriptPath, ...args],
    {
      cwd,
      env: withoutHelperEnv(),
      encoding: "utf8",
    },
  );
}

function withoutHelperEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("SCAN_HELPER_")) {
      env[key] = "";
    }
  }
  env.SCAN_HELPER_APP_BUNDLE_ID = "";
  env.SCAN_HELPER_DESIGNATED_REQUIREMENT = "";
  env.SCAN_HELPER_FDA_VALIDATION_MATRIX_READY = "";
  env.SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY = "";
  env.SCAN_HELPER_PEER_VALIDATION_READY = "";
  env.SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY = "";
  env.SCAN_HELPER_PROTOTYPE_ENUMERATE = "";
  env.SCAN_HELPER_SM_PROBE_BIN = "";
  env.SCAN_HELPER_TEAM_ID = "";
  env.SCAN_HELPER_TRANSPORT = "";
  env.SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY = "";
  return env;
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

function writeInstallReadyProject(
  projectRoot: string,
  teamId: string,
  requirement: string,
): void {
  const entitlementsDir = path.join(projectRoot, "resources", "entitlements");
  const executablePath = path.join(
    projectRoot,
    DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  );
  const metadataPath = path.join(
    projectRoot,
    DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH,
  );
  const bridgePath = path.join(
    projectRoot,
    DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
  );
  const matrixPath = path.join(
    projectRoot,
    DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH,
  );

  fs.mkdirSync(entitlementsDir, { recursive: true });
  fs.writeFileSync(path.join(entitlementsDir, "mac.plist"), "<plist/>");
  fs.writeFileSync(path.join(entitlementsDir, "mac.inherit.plist"), "<plist/>");
  fs.mkdirSync(path.dirname(executablePath), { recursive: true });
  writeFakeMachO(executablePath);
  fs.chmodSync(executablePath, 0o755);
  fs.mkdirSync(path.dirname(bridgePath), { recursive: true });
  writeFakeMachO(bridgePath);
  fs.chmodSync(bridgePath, 0o755);
  fs.writeFileSync(
    metadataPath,
    JSON.stringify({
      ready: true,
      requirement,
      teamId,
    }),
  );
  fs.writeFileSync(
    path.join(projectRoot, "electron-builder.json"),
    JSON.stringify({
      mac: {
        entitlements: "resources/entitlements/mac.plist",
        entitlementsInherit: "resources/entitlements/mac.inherit.plist",
        extraFiles: [
          {
            from: path.dirname(DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH),
            to: "Library/LaunchServices",
            filter: ["com.example.diskvisualizer.privileged-helper"],
          },
          {
            from: "resources/helper/LaunchDaemons",
            to: "Library/LaunchDaemons",
            filter: [DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME],
          },
        ],
        hardenedRuntime: true,
      },
      extraResources: [
        {
          from: path.dirname(
            DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
          ),
          to: "bin",
          filter: [
            path.basename(DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH),
          ],
        },
      ],
    }),
  );
  fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
  fs.writeFileSync(
    matrixPath,
    JSON.stringify({
      targetMacOS: "15.0",
      scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) => ({
        id,
        notes: `validated ${id}`,
        status: "passed",
        validatedAt: "2026-06-08T00:00:00.000Z",
        validator: "manual-fda-audit",
      })),
    }),
  );
}

function writeFakeMachO(filePath: string): void {
  fs.writeFileSync(filePath, Buffer.from([
    0xcf,
    0xfa,
    0xed,
    0xfe,
    0x0c,
    0x00,
    0x00,
    0x01,
  ]));
}
