/* @vitest-environment node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
  buildHelperPreflightAudit,
  resolveHelperPreflightAuditStrictMode,
  resolveHelperPreflightAuditStrictExitCode,
} from "../../src/main/services/helper/helperPreflightAudit";
import {
  buildHelperCodeSigningRequirement,
  DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME,
} from "../../src/main/services/helper/helperRegistration";

function writeMachOExecutable(executablePath: string): void {
  fs.writeFileSync(executablePath, Buffer.from([
    0xcf,
    0xfa,
    0xed,
    0xfe,
    0x0c,
    0x00,
    0x00,
    0x01,
  ]));
  fs.chmodSync(executablePath, 0o755);
}

describe("helperPreflightAudit", () => {
  it("reports unresolved signing, listener, and FDA blockers while recognizing packaging evidence", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-preflight-audit-"),
    );

    try {
      const entitlementsPath = path.join(
        projectRoot,
        "resources",
        "entitlements",
      );
      const executablePath = path.join(
        projectRoot,
        DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
      );
      const bridgePath = path.join(
        projectRoot,
        DISK_SCAN_HELPER_XPC_ENUMERATE_BRIDGE_SOURCE_RELATIVE_PATH,
      );
      const matrixPath = path.join(
        projectRoot,
        "docs",
        "helper-fda-validation-matrix.json",
      );

      fs.mkdirSync(entitlementsPath, { recursive: true });
      fs.writeFileSync(path.join(entitlementsPath, "mac.plist"), "<plist/>");
      fs.writeFileSync(
        path.join(entitlementsPath, "mac.inherit.plist"),
        "<plist/>",
      );
      fs.mkdirSync(path.dirname(executablePath), { recursive: true });
      writeMachOExecutable(executablePath);
      fs.mkdirSync(path.dirname(bridgePath), { recursive: true });
      writeMachOExecutable(bridgePath);
      fs.writeFileSync(
        path.join(projectRoot, "electron-builder.json"),
        JSON.stringify({
          extraResources: [
            {
              from: "resources/bin",
              to: "bin",
              filter: ["helper-xpc-enumerate-macos"],
            },
          ],
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
        }),
      );
      fs.writeFileSync(
        `${executablePath}.requirement.json`,
        JSON.stringify({
          ready: false,
          teamId: "TEAMID_NOT_CONFIGURED",
          requirement:
            'identifier "com.example.diskvisualizer" and certificate leaf[subject.OU] = "TEAMID_NOT_CONFIGURED"',
        }),
      );
      fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "pending",
          scenarios: [
            { id: "unsigned-dev-app-without-fda", status: "pending" },
            {
              id: "signed-dev-app-without-fda",
              notes: "protected paths were unexpectedly readable",
              status: "failed",
              validatedAt: "2026-06-06T00:00:00.000Z",
              validator: "manual-fda-audit",
            },
          ],
        }),
      );

      const audit = buildHelperPreflightAudit({
        env: {
          SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY: "1",
          SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY: "1",
          SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY: "1",
          SCAN_HELPER_FDA_VALIDATION_MATRIX_READY: "1",
        },
        projectRoot,
      });

      expect(audit.status).toBe("blocked");
      expect(audit.blockers).toEqual([
        "team-id-missing",
        "designated-requirement-missing",
        "privileged-helper-listener-requirement-missing",
        "fda-validation-matrix-missing",
      ]);
      expect(audit.effectiveEvidence).toEqual({
        teamId: false,
        designatedRequirement: false,
        packagingEntitlements: true,
        privilegedHelperExecutable: true,
        helperXpcEnumerateBridge: true,
        privilegedHelperListenerRequirement: false,
        fdaValidationMatrix: false,
      });
      expect(audit.contract.helperLabel).toBe(
        "com.example.diskvisualizer.privileged-helper",
      );
      expect(audit.details.privilegedHelperListenerRequirement).toEqual({
        metadataFound: true,
        ready: false,
        teamId: "TEAMID_NOT_CONFIGURED",
        requirement:
          'identifier "com.example.diskvisualizer" and certificate leaf[subject.OU] = "TEAMID_NOT_CONFIGURED"',
      });
      expect(audit.details.fdaValidationMatrix).toEqual({
        matrixFound: true,
        targetMacOS: "pending",
        targetMacOSReady: false,
        failedScenarios: [
          "signed-dev-app-without-fda",
        ],
        missingPassedScenarios: [
          "unsigned-dev-app-without-fda",
          "signed-dev-app-without-fda",
          "signed-dev-app-with-fda",
          "installed-helper-without-fda",
          "installed-helper-with-app-fda",
          "installed-helper-with-helper-specific-fda",
        ],
        scenariosMissingEvidence: [
          "unsigned-dev-app-without-fda",
          "signed-dev-app-with-fda",
          "installed-helper-without-fda",
          "installed-helper-with-app-fda",
          "installed-helper-with-helper-specific-fda",
        ],
      });
      expect(audit.remediation).toEqual([
        {
          blocker: "team-id-missing",
          description: expect.any(String),
          requiredInputs: ["SCAN_HELPER_TEAM_ID"],
        },
        {
          blocker: "designated-requirement-missing",
          description: expect.any(String),
          requiredInputs: ["SCAN_HELPER_DESIGNATED_REQUIREMENT"],
        },
        {
          blocker: "privileged-helper-listener-requirement-missing",
          commands: ["pnpm build:native:privileged-helper"],
          description: expect.any(String),
          requiredArtifacts: [
            "resources/helper/LaunchServices/com.example.diskvisualizer.privileged-helper.requirement.json",
          ],
        },
        {
          blocker: "fda-validation-matrix-missing",
          commands: [
            "pnpm record:helper-fda-scenario --list",
            "pnpm record:helper-fda-scenario --scenario <scenario-id> --target-macos <macos-version> --validator <validator> --notes <notes>",
          ],
          description: expect.any(String),
          requiredArtifacts: ["docs/helper-fda-validation-matrix.json"],
          requiredInputs: ["SCAN_HELPER_FDA_VALIDATION_MATRIX_READY"],
        },
      ]);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("separates discovered artifacts from explicit preflight confirmations", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-preflight-audit-artifacts-"),
    );

    try {
      const entitlementsPath = path.join(
        projectRoot,
        "resources",
        "entitlements",
      );
      const executablePath = path.join(
        projectRoot,
        DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
      );

      fs.mkdirSync(entitlementsPath, { recursive: true });
      fs.writeFileSync(path.join(entitlementsPath, "mac.plist"), "<plist/>");
      fs.writeFileSync(
        path.join(entitlementsPath, "mac.inherit.plist"),
        "<plist/>",
      );
      fs.mkdirSync(path.dirname(executablePath), { recursive: true });
      writeMachOExecutable(executablePath);
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
        }),
      );

      const audit = buildHelperPreflightAudit({
        env: {},
        projectRoot,
      });

      expect(audit.artifactEvidence.packagingEntitlements).toBe(true);
      expect(audit.artifactEvidence.privilegedHelperExecutable).toBe(true);
      expect(audit.artifactEvidence.helperXpcEnumerateBridge).toBe(false);
      expect(audit.confirmations.packagingEntitlements).toBe(false);
      expect(audit.confirmations.privilegedHelperExecutable).toBe(false);
      expect(audit.confirmations.helperXpcEnumerateBridge).toBe(false);
      expect(audit.effectiveEvidence.packagingEntitlements).toBe(false);
      expect(audit.effectiveEvidence.privilegedHelperExecutable).toBe(false);
      expect(audit.effectiveEvidence.helperXpcEnumerateBridge).toBe(false);
      expect(audit.blockers).toContain("packaging-entitlements-missing");
      expect(audit.blockers).toContain("privileged-helper-executable-missing");
      expect(audit.blockers).toContain("helper-xpc-enumerate-bridge-missing");
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("reports missing XPC enumerate bridge evidence without blocking install readiness", () => {
    const requirement = buildHelperCodeSigningRequirement("ABCDE12345");
    const audit = buildHelperPreflightAudit({
      env: {
        SCAN_HELPER_TEAM_ID: "ABCDE12345",
        SCAN_HELPER_DESIGNATED_REQUIREMENT: requirement,
        SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY: "1",
        SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY: "1",
        SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY: "1",
        SCAN_HELPER_FDA_VALIDATION_MATRIX_READY: "1",
      },
      projectRoot: os.tmpdir(),
    });

    expect(audit.blockers).toContain("helper-xpc-enumerate-bridge-missing");
    expect(audit.effectiveEvidence.helperXpcEnumerateBridge).toBe(false);
    expect(audit.readiness.installBlockers).not.toContain(
      "helper-xpc-enumerate-bridge-missing",
    );
    expect(audit.remediation).toContainEqual({
      blocker: "helper-xpc-enumerate-bridge-missing",
      commands: ["pnpm build:native:helper-xpc-enumerate"],
      description: expect.any(String),
      requiredArtifacts: ["resources/bin/helper-xpc-enumerate-macos"],
      requiredInputs: ["SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY"],
    });
  });

  it("does not report malformed signing identity values as usable audit evidence", () => {
    const audit = buildHelperPreflightAudit({
      env: {
        SCAN_HELPER_TEAM_ID: "not-a-team-id",
        SCAN_HELPER_DESIGNATED_REQUIREMENT:
          'identifier "com.other.app" and anchor apple generic',
      },
    });

    expect(audit.artifactEvidence.teamId).toBe(false);
    expect(audit.artifactEvidence.designatedRequirement).toBe(false);
    expect(audit.confirmations.teamId).toBe(false);
    expect(audit.confirmations.designatedRequirement).toBe(false);
    expect(audit.effectiveEvidence.teamId).toBe(false);
    expect(audit.effectiveEvidence.designatedRequirement).toBe(false);
    expect(audit.blockers).toEqual(expect.arrayContaining([
      "team-id-missing",
      "designated-requirement-missing",
    ]));
  });

  it("distinguishes install readiness from full enumeration readiness", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-preflight-audit-readiness-"),
    );

    try {
      const entitlementsPath = path.join(
        projectRoot,
        "resources",
        "entitlements",
      );
      const executablePath = path.join(
        projectRoot,
        DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
      );
      const requirement = buildHelperCodeSigningRequirement("ABCDE12345");

      fs.mkdirSync(entitlementsPath, { recursive: true });
      fs.writeFileSync(path.join(entitlementsPath, "mac.plist"), "<plist/>");
      fs.writeFileSync(
        path.join(entitlementsPath, "mac.inherit.plist"),
        "<plist/>",
      );
      fs.mkdirSync(path.dirname(executablePath), { recursive: true });
      writeMachOExecutable(executablePath);
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
        }),
      );
      fs.writeFileSync(
        `${executablePath}.requirement.json`,
        JSON.stringify({
          ready: true,
          requirement,
          teamId: "ABCDE12345",
        }),
      );

      const audit = buildHelperPreflightAudit({
        env: {
          SCAN_HELPER_TEAM_ID: "ABCDE12345",
          SCAN_HELPER_DESIGNATED_REQUIREMENT: requirement,
          SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY: "1",
          SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY: "1",
          SCAN_HELPER_FDA_VALIDATION_MATRIX_READY: "1",
        },
        projectRoot,
      });

      expect(audit.blockers).toEqual([
        "helper-xpc-enumerate-bridge-missing",
        "fda-validation-matrix-missing",
      ]);
      expect(audit.readiness).toEqual({
        enumerateReady: false,
        installBlockers: [],
        installReady: true,
      });
      expect(audit.remediation).toEqual([
        {
          blocker: "helper-xpc-enumerate-bridge-missing",
          commands: ["pnpm build:native:helper-xpc-enumerate"],
          description: expect.any(String),
          requiredArtifacts: ["resources/bin/helper-xpc-enumerate-macos"],
          requiredInputs: ["SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY"],
        },
        {
          blocker: "fda-validation-matrix-missing",
          commands: [
            "pnpm record:helper-fda-scenario --list",
            "pnpm record:helper-fda-scenario --scenario <scenario-id> --target-macos <macos-version> --validator <validator> --notes <notes>",
          ],
          description: expect.any(String),
          requiredArtifacts: ["docs/helper-fda-validation-matrix.json"],
          requiredInputs: ["SCAN_HELPER_FDA_VALIDATION_MATRIX_READY"],
        },
      ]);
      expect(resolveHelperPreflightAuditStrictExitCode(audit, "install")).toBe(0);
      expect(resolveHelperPreflightAuditStrictExitCode(audit, "enumerate")).toBe(1);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("defaults unknown strict audit modes to enumerate", () => {
    expect(resolveHelperPreflightAuditStrictMode("install")).toBe("install");
    expect(resolveHelperPreflightAuditStrictMode("enumerate")).toBe("enumerate");
    expect(resolveHelperPreflightAuditStrictMode("")).toBe("enumerate");
    expect(resolveHelperPreflightAuditStrictMode("typo")).toBe("enumerate");
    expect(resolveHelperPreflightAuditStrictMode(undefined)).toBe("enumerate");
  });

  it("exposes the helper preflight audit as a package script", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["audit:helper-preflight"]).toBe(
      "bun run scripts/audit-helper-preflight.ts",
    );
  });
});
