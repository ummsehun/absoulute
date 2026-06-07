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
const controlSourcePath = path.join(
  process.cwd(),
  "native",
  "macos-helper",
  "control",
  "main.swift",
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
    expect(source).toContain("@objc(DiskVisualizerPrivilegedHelperProtocol)");
    expect(source).toContain("func healthCheck(_ reply:");
    expect(source).toContain("func getVersion(_ reply:");
    expect(source).toContain("newConnection.exportedInterface");
    expect(source).toContain("newConnection.exportedObject");
    expect(source).toContain("newConnection.resume()");
    expect(source).toContain("return true");
    expect(source).toContain("expectedClientTeamId == \"TEAMID_NOT_CONFIGURED\"");
    expect(source).toContain("newConnection.invalidate()");
    expect(source).toContain("return false");
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

  it("generates a real Team ID source that can reach the exported XPC surface", () => {
    const source = fs.readFileSync(sourcePath, "utf8");
    const generatedSource = source.replace("TEAMID_NOT_CONFIGURED", "ABCDE12345");

    expect(generatedSource).toContain('let expectedClientTeamId = "ABCDE12345"');
    expect(generatedSource).toContain('expectedClientTeamId == "TEAMID_NOT_CONFIGURED"');
    expect(generatedSource).toContain("newConnection.exportedInterface");
    expect(generatedSource).toContain("newConnection.exportedObject");
    expect(generatedSource).toContain("newConnection.resume()");
    expect(generatedSource).toContain("return true");
  });

  it("builds a helper control command that probes only the privileged helper XPC control surface", () => {
    const source = fs.readFileSync(controlSourcePath, "utf8");

    expect(source).toContain("@objc(DiskVisualizerPrivilegedHelperProtocol)");
    expect(source).toContain("func healthCheck(_ reply:");
    expect(source).toContain("func getVersion(_ reply:");
    expect(source).toContain("NSXPCConnection(");
    expect(source).toContain("machServiceName: helperMachServiceName");
    expect(source).toContain("remoteObjectInterface");
    expect(source).toContain("remoteObjectProxyWithErrorHandler");
    expect(source).toContain("helper.healthCheck");
    expect(source).toContain("helper.getVersion");
    expect(source).toContain("helperProtocolErrorCode");
    expect(source).toContain('"E_INVALID_REQUEST"');
    expect(source).toContain('"E_HELPER_INTERNAL"');
    expect(source).not.toContain("E_XPC_CONTROL_FAILED");
    expect(source).toContain('"type": "ready"');
    expect(source).toContain('"type": "done"');
    expect(source).toContain('"type": "error"');
    expect(source).not.toContain("scan.enumerate");
    expect(source).not.toContain("enumerate(");
  });
});
