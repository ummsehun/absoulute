/* @vitest-environment node */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISK_SCAN_HELPER_LABEL,
  DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
} from "../../src/main/services/helper/helperRegistration";

const sourcePath = path.join(
  process.cwd(),
  "native",
  "macos-helper",
  "privileged-helper",
  "main.swift",
);
const buildScriptPath = path.join(
  process.cwd(),
  "scripts",
  "build-macos-privileged-helper.ts",
);
const packageJsonPath = path.join(process.cwd(), "package.json");

describe("macOS privileged helper executable", () => {
  it("defines a launchd Mach service XPC listener guarded by caller signing requirement", () => {
    const source = fs.readFileSync(sourcePath, "utf8");

    expect(source).toContain(`let helperMachServiceName = "${DISK_SCAN_HELPER_LABEL}"`);
    expect(source).toContain("NSXPCListener(machServiceName: helperMachServiceName)");
    expect(source).toContain("setConnectionCodeSigningRequirement");
    expect(source).toContain(`identifier "${DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER}"`);
    expect(source).toContain("anchor apple generic");
    expect(source).toContain("certificate leaf[subject.OU]");
    expect(source).toContain("shouldAcceptNewConnection");
  });

  it("builds the privileged helper executable into the LaunchServices source path", () => {
    const source = fs.readFileSync(buildScriptPath, "utf8");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(source).toContain('"native"');
    expect(source).toContain('"macos-helper"');
    expect(source).toContain('"privileged-helper"');
    expect(source).toContain('"main.swift"');
    expect(source).toContain('"resources"');
    expect(source).toContain('"helper"');
    expect(source).toContain('"LaunchServices"');
    expect(source).toContain(`"${DISK_SCAN_HELPER_LABEL}"`);
    expect(source).toContain("SCAN_HELPER_TEAM_ID");
    expect(source).toContain("TEAMID_NOT_CONFIGURED");
    expect(source).toContain("anchor apple generic");
    expect(source).toContain(".requirement.json");
    expect(packageJson.scripts).toMatchObject({
      "build:native:privileged-helper":
        "bun run scripts/build-macos-privileged-helper.ts",
    });
  });
});
