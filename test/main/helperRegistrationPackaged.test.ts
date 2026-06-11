/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH,
  DISK_SCAN_HELPER_FDA_MATRIX_RESOURCES_RELATIVE_PATH,
  DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH,
  DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS,
  DISK_SCAN_HELPER_REQUIREMENT_METADATA_BUNDLE_RELATIVE_PATH,
  DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
  DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
  DISK_VISUALIZER_APPLE_TEAM_ID,
  buildHelperCodeSigningRequirement,
  resolveHelperRegistrationPreflight,
  resolveHelperRegistrationPreflightInputAuto,
  resolveHelperRegistrationPreflightInputForPackagedApp,
  resolvePackagedAppBundlePath,
} from "../../src/main/services/helper/helperRegistration";

const MACH_O_MAGIC_64 = Buffer.from([0xcf, 0xfa, 0xed, 0xfe]);

let bundleRoot: string;
let appBundlePath: string;
let resourcesPath: string;

function writeExecutable(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([MACH_O_MAGIC_64, Buffer.alloc(16)]));
  fs.chmodSync(filePath, 0o755);
}

function writeInfoPlist(bundleIdentifier: string): void {
  fs.mkdirSync(path.join(appBundlePath, "Contents"), { recursive: true });
  fs.writeFileSync(
    path.join(appBundlePath, "Contents", "Info.plist"),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<plist version="1.0">',
      "<dict>",
      "  <key>CFBundleIdentifier</key>",
      `  <string>${bundleIdentifier}</string>`,
      "</dict>",
      "</plist>",
    ].join("\n"),
  );
}

function writeValidatedFdaMatrix(): void {
  fs.mkdirSync(resourcesPath, { recursive: true });
  fs.writeFileSync(
    path.join(resourcesPath, DISK_SCAN_HELPER_FDA_MATRIX_RESOURCES_RELATIVE_PATH),
    JSON.stringify({
      targetMacOS: "26.5.1",
      scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) => ({
        id,
        status: "passed",
        validatedAt: "2026-06-10T00:00:00.000Z",
        validator: "test",
        notes: "validated in test fixture",
      })),
    }),
  );
}

function writeFullPackagedFixture(): void {
  writeInfoPlist(DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER);
  writeExecutable(
    path.join(appBundlePath, DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH),
  );
  const plistPath = path.join(
    appBundlePath,
    DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH,
  );
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, "<plist/>");
  writeExecutable(path.join(
    resourcesPath,
    "bin",
    path.basename(DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH),
  ));
  fs.writeFileSync(
    path.join(
      appBundlePath,
      DISK_SCAN_HELPER_REQUIREMENT_METADATA_BUNDLE_RELATIVE_PATH,
    ),
    JSON.stringify({
      ready: true,
      teamId: DISK_VISUALIZER_APPLE_TEAM_ID,
      requirement: buildHelperCodeSigningRequirement(
        DISK_VISUALIZER_APPLE_TEAM_ID,
        DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
      ),
    }),
  );
  writeValidatedFdaMatrix();
}

beforeEach(() => {
  bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dv-packaged-"));
  appBundlePath = path.join(bundleRoot, "DiskVisualizer.app");
  resourcesPath = path.join(appBundlePath, "Contents", "Resources");
});

afterEach(() => {
  fs.rmSync(bundleRoot, { recursive: true, force: true });
});

describe("resolvePackagedAppBundlePath", () => {
  it("resolves the bundle when Info.plist matches the app identifier", () => {
    writeInfoPlist(DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER);
    expect(resolvePackagedAppBundlePath(resourcesPath)).toBe(appBundlePath);
  });

  it("rejects bundles with a foreign identifier (dev Electron.app)", () => {
    writeInfoPlist("com.github.Electron");
    expect(resolvePackagedAppBundlePath(resourcesPath)).toBeNull();
  });

  it("rejects resources paths outside an .app bundle", () => {
    const plainDir = path.join(bundleRoot, "plain", "nested", "resources");
    fs.mkdirSync(plainDir, { recursive: true });
    expect(resolvePackagedAppBundlePath(plainDir)).toBeNull();
  });

  it("rejects null and missing Info.plist", () => {
    expect(resolvePackagedAppBundlePath(null)).toBeNull();
    fs.mkdirSync(resourcesPath, { recursive: true });
    expect(resolvePackagedAppBundlePath(resourcesPath)).toBeNull();
  });
});

describe("resolveHelperRegistrationPreflightInputForPackagedApp", () => {
  it("reaches ready status when the bundle carries all helper artifacts", () => {
    writeFullPackagedFixture();
    const input = resolveHelperRegistrationPreflightInputForPackagedApp({
      appBundlePath,
      resourcesPath,
    });

    const preflight = resolveHelperRegistrationPreflight(input);
    expect(preflight.blockers).toEqual([]);
    expect(preflight.status).toBe("ready");
  });

  it("derives identity from build-time constants", () => {
    writeFullPackagedFixture();
    const input = resolveHelperRegistrationPreflightInputForPackagedApp({
      appBundlePath,
      resourcesPath,
    });

    expect(input.identity).toEqual({
      appBundleIdentifier: DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
      teamId: DISK_VISUALIZER_APPLE_TEAM_ID,
      designatedRequirement: buildHelperCodeSigningRequirement(
        DISK_VISUALIZER_APPLE_TEAM_ID,
        DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
      ),
    });
  });

  it("blocks when the privileged helper executable is missing", () => {
    writeFullPackagedFixture();
    fs.rmSync(path.join(
      appBundlePath,
      DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH,
    ));

    const preflight = resolveHelperRegistrationPreflight(
      resolveHelperRegistrationPreflightInputForPackagedApp({
        appBundlePath,
        resourcesPath,
      }),
    );
    expect(preflight.status).toBe("blocked");
    expect(preflight.blockers).toContain("privileged-helper-executable-missing");
  });

  it("blocks when the launch daemon plist is missing", () => {
    writeFullPackagedFixture();
    fs.rmSync(path.join(
      appBundlePath,
      DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH,
    ));

    const preflight = resolveHelperRegistrationPreflight(
      resolveHelperRegistrationPreflightInputForPackagedApp({
        appBundlePath,
        resourcesPath,
      }),
    );
    expect(preflight.blockers).toContain("privileged-helper-executable-missing");
  });

  it("blocks when the bundled FDA matrix is incomplete", () => {
    writeFullPackagedFixture();
    fs.writeFileSync(
      path.join(
        resourcesPath,
        DISK_SCAN_HELPER_FDA_MATRIX_RESOURCES_RELATIVE_PATH,
      ),
      JSON.stringify({ targetMacOS: "pending", scenarios: [] }),
    );

    const preflight = resolveHelperRegistrationPreflight(
      resolveHelperRegistrationPreflightInputForPackagedApp({
        appBundlePath,
        resourcesPath,
      }),
    );
    expect(preflight.blockers).toContain("fda-validation-matrix-missing");
  });
});

describe("resolveHelperRegistrationPreflightInputAuto", () => {
  it("uses packaged evidence when running inside our app bundle", () => {
    writeFullPackagedFixture();
    const input = resolveHelperRegistrationPreflightInputAuto(
      {},
      "/nonexistent-project-root",
      resourcesPath,
    );

    expect(resolveHelperRegistrationPreflight(input).status).toBe("ready");
  });

  it("falls back to env evidence outside a packaged bundle", () => {
    const input = resolveHelperRegistrationPreflightInputAuto(
      {},
      "/nonexistent-project-root",
      null,
    );

    const preflight = resolveHelperRegistrationPreflight(input);
    expect(preflight.status).toBe("blocked");
    expect(preflight.blockers).toContain("team-id-missing");
  });
});
