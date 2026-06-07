/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH,
  DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH,
  DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME,
  DISK_SCAN_HELPER_LABEL,
  DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
  buildHelperCodeSigningRequirement,
  getHelperRegistrationContract,
  resolvePackagingEntitlementsEvidence,
  resolvePrivilegedHelperExecutableEvidence,
  resolvePrivilegedHelperListenerRequirementEvidence,
  resolveFdaValidationMatrixEvidence,
  resolveHelperRegistrationPreflightInputFromEnv,
  resolveHelperRegistrationPreflight,
} from "../../src/main/services/helper/helperRegistration";

describe("helperRegistration", () => {
  it("defines the ServiceManagement daemon registration contract", () => {
    expect(getHelperRegistrationContract()).toEqual({
      appBundleIdentifier: DISK_VISUALIZER_APP_BUNDLE_IDENTIFIER,
      helperLabel: DISK_SCAN_HELPER_LABEL,
      helperExecutableBundleRelativePath:
        DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH,
      launchDaemonPlistName: DISK_SCAN_HELPER_LAUNCH_DAEMON_PLIST_NAME,
      launchDaemonBundleRelativePath:
        DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH,
      serviceManagementModel: "smappservice-daemon",
    });

    expect(DISK_SCAN_HELPER_LABEL).toBe(
      "com.example.diskvisualizer.privileged-helper",
    );
    expect(DISK_SCAN_HELPER_LAUNCH_DAEMON_BUNDLE_RELATIVE_PATH).toBe(
      "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
    );
    expect(DISK_SCAN_HELPER_EXECUTABLE_BUNDLE_RELATIVE_PATH).toBe(
      "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
    );
    expect(DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH).toBe(
      "docs/helper-fda-validation-matrix.json",
    );
  });

  it("keeps helper registration blocked until signing, packaging, and FDA gates are explicit", () => {
    expect(resolveHelperRegistrationPreflight()).toEqual({
      contract: getHelperRegistrationContract(),
      status: "blocked",
      blockers: [
        "team-id-missing",
        "designated-requirement-missing",
        "packaging-entitlements-missing",
        "privileged-helper-executable-missing",
        "privileged-helper-listener-requirement-missing",
        "fda-validation-matrix-missing",
      ],
    });
  });

  it("marks the registration preflight ready only when every helper gate has evidence", () => {
    expect(
      resolveHelperRegistrationPreflight({
        identity: {
          teamId: "ABCDE12345",
          designatedRequirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
        },
        packagingEntitlementsReady: true,
        privilegedHelperExecutableReady: true,
        privilegedHelperListenerRequirementReady: true,
        fdaValidationMatrixReady: true,
      }),
    ).toEqual({
      contract: getHelperRegistrationContract(),
      status: "ready",
      blockers: [],
    });
  });

  it("keeps registration blocked when signing identity evidence is malformed", () => {
    expect(
      resolveHelperRegistrationPreflight({
        identity: {
          teamId: "not-a-team-id",
          designatedRequirement:
            'identifier "com.other.app" and anchor apple generic',
        },
        packagingEntitlementsReady: true,
        privilegedHelperExecutableReady: true,
        privilegedHelperListenerRequirementReady: true,
        fdaValidationMatrixReady: true,
      }),
    ).toEqual({
      contract: getHelperRegistrationContract(),
      status: "blocked",
      blockers: [
        "team-id-missing",
        "designated-requirement-missing",
      ],
    });
  });

  it("builds the helper code signing requirement from the app identifier and Team ID", () => {
    expect(buildHelperCodeSigningRequirement("ABCDE12345")).toBe(
      'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
    );

    expect(() => buildHelperCodeSigningRequirement("not-a-team-id")).toThrow(
      "valid Apple Team ID",
    );
  });

  it("loads helper registration preflight evidence from explicit environment variables", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-env-evidence-"),
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
          teamId: "ABCDE12345",
          requirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
        }),
      );

      expect(
        resolveHelperRegistrationPreflightInputFromEnv({
          SCAN_HELPER_TEAM_ID: "ABCDE12345",
          SCAN_HELPER_DESIGNATED_REQUIREMENT:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
          SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY: "true",
          SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY: "true",
        }, projectRoot),
      ).toEqual({
        identity: {
          teamId: "ABCDE12345",
          designatedRequirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
        },
        packagingEntitlementsReady: true,
        privilegedHelperExecutableReady: true,
        privilegedHelperListenerRequirementReady: true,
        fdaValidationMatrixReady: false,
      });
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("accepts packaging entitlement evidence only when configured files are wired into mac packaging", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-packaging-evidence-"),
    );

    try {
      fs.mkdirSync(path.join(projectRoot, "resources", "entitlements"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(projectRoot, "resources", "entitlements", "mac.plist"),
        "<plist/>",
      );

      expect(resolvePackagingEntitlementsEvidence(projectRoot)).toBe(false);

      fs.writeFileSync(
        path.join(projectRoot, "resources", "entitlements", "mac.inherit.plist"),
        "<plist/>",
      );

      expect(resolvePackagingEntitlementsEvidence(projectRoot)).toBe(false);

      fs.writeFileSync(
        path.join(projectRoot, "electron-builder.json"),
        JSON.stringify({
          mac: {
            entitlements: "resources/entitlements/mac.plist",
            entitlementsInherit: "resources/entitlements/mac.inherit.plist",
            hardenedRuntime: true,
          },
        }),
      );

      expect(resolvePackagingEntitlementsEvidence(projectRoot)).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("accepts privileged helper executable evidence only when the configured executable exists", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-executable-evidence-"),
    );

    try {
      const executablePath = path.join(
        projectRoot,
        DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
      );

      expect(resolvePrivilegedHelperExecutableEvidence(projectRoot)).toBe(false);

      fs.mkdirSync(path.dirname(executablePath), { recursive: true });
      fs.writeFileSync(executablePath, "#!/bin/sh\nexit 0\n");

      expect(resolvePrivilegedHelperExecutableEvidence(projectRoot)).toBe(false);

      fs.chmodSync(executablePath, 0o755);

      expect(resolvePrivilegedHelperExecutableEvidence(projectRoot)).toBe(false);

      fs.writeFileSync(
        path.join(projectRoot, "electron-builder.json"),
        JSON.stringify({
          mac: {
            extraFiles: [
              {
                from: path.dirname(DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH),
                to: "Library/LaunchServices",
                filter: ["com.example.diskvisualizer.privileged-helper"],
              },
            ],
          },
        }),
      );

      expect(resolvePrivilegedHelperExecutableEvidence(projectRoot)).toBe(false);

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

      expect(resolvePrivilegedHelperExecutableEvidence(projectRoot)).toBe(false);

      fs.writeFileSync(
        path.join(projectRoot, "electron-builder.json"),
        JSON.stringify({
          mac: {
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
          },
        }),
      );

      expect(resolvePrivilegedHelperExecutableEvidence(projectRoot)).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("accepts privileged helper listener requirement evidence only when build metadata matches the Team ID", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-listener-evidence-"),
    );

    try {
      const executablePath = path.join(
        projectRoot,
        DISK_SCAN_HELPER_EXECUTABLE_SOURCE_RELATIVE_PATH,
      );
      fs.mkdirSync(path.dirname(executablePath), { recursive: true });

      expect(
        resolvePrivilegedHelperListenerRequirementEvidence(
          projectRoot,
          "ABCDE12345",
        ),
      ).toBe(false);

      fs.writeFileSync(
        `${executablePath}.requirement.json`,
        JSON.stringify({
          ready: false,
          teamId: "ZZZZZ99999",
          requirement:
            'identifier "com.example.diskvisualizer" and certificate leaf[subject.OU] = "ZZZZZ99999"',
        }),
      );

      expect(
        resolvePrivilegedHelperListenerRequirementEvidence(
          projectRoot,
          "ABCDE12345",
        ),
      ).toBe(false);

      fs.writeFileSync(
        `${executablePath}.requirement.json`,
        JSON.stringify({
          ready: true,
          teamId: "ABCDE12345",
          requirement:
            'identifier "com.example.diskvisualizer" and certificate leaf[subject.OU] = "ABCDE12345"',
        }),
      );

      expect(
        resolvePrivilegedHelperListenerRequirementEvidence(
          projectRoot,
          "ABCDE12345",
        ),
      ).toBe(false);

      fs.writeFileSync(
        `${executablePath}.requirement.json`,
        JSON.stringify({
          ready: true,
          teamId: "ABCDE12345",
          requirement:
            'identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345"',
        }),
      );

      expect(
        resolvePrivilegedHelperListenerRequirementEvidence(
          projectRoot,
          "ABCDE12345",
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("accepts FDA validation matrix evidence only when every required helper scenario passed", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-matrix-"),
    );
    const matrixPath = path.join(projectRoot, "docs", "helper-fda-validation-matrix.json");

    try {
      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(false);

      fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "15.0",
          scenarios: [
            { id: "unsigned-dev-app-without-fda", status: "passed" },
            { id: "signed-dev-app-without-fda", status: "passed" },
            { id: "signed-dev-app-with-fda", status: "passed" },
            { id: "installed-helper-without-fda", status: "passed" },
            { id: "installed-helper-with-app-fda", status: "passed" },
          ],
        }),
      );

      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(false);

      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "15.0",
          scenarios: [
            { id: "unsigned-dev-app-without-fda", status: "passed" },
            { id: "signed-dev-app-without-fda", status: "passed" },
            { id: "signed-dev-app-with-fda", status: "passed" },
            { id: "installed-helper-without-fda", status: "passed" },
            { id: "installed-helper-with-app-fda", status: "passed" },
            {
              id: "installed-helper-with-helper-specific-fda",
              status: "pending",
            },
          ],
        }),
      );

      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(false);

      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "15.0",
          scenarios: [
            {
              id: "unsigned-dev-app-without-fda",
              notes: "validated unsigned app without FDA denial path",
              status: "passed",
              validatedAt: "2026-06-06T00:00:00.000Z",
              validator: "manual-fda-audit",
            },
            {
              id: "signed-dev-app-without-fda",
              notes: "validated signed dev app without FDA denial path",
              status: "passed",
              validatedAt: "2026-06-06T00:00:00.000Z",
              validator: "manual-fda-audit",
            },
            {
              id: "signed-dev-app-with-fda",
              notes: "validated signed dev app with FDA access path",
              status: "passed",
              validatedAt: "2026-06-06T00:00:00.000Z",
              validator: "manual-fda-audit",
            },
            {
              id: "installed-helper-without-fda",
              notes: "validated installed helper without FDA denial path",
              status: "passed",
              validatedAt: "2026-06-06T00:00:00.000Z",
              validator: "manual-fda-audit",
            },
            {
              id: "installed-helper-with-app-fda",
              notes: "validated installed helper with app FDA path",
              status: "passed",
              validatedAt: "2026-06-06T00:00:00.000Z",
              validator: "manual-fda-audit",
            },
            {
              id: "installed-helper-with-helper-specific-fda",
              notes: "validated helper-specific FDA behavior",
              status: "passed",
              validatedAt: "2026-06-06T00:00:00.000Z",
              validator: "manual-fda-audit",
            },
          ],
        }),
      );

      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("rejects FDA validation matrix evidence when the target macOS version is not concrete", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-matrix-target-"),
    );
    const matrixPath = path.join(projectRoot, "docs", "helper-fda-validation-matrix.json");

    try {
      fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "pending",
          scenarios: [
            { id: "unsigned-dev-app-without-fda", status: "passed" },
            { id: "signed-dev-app-without-fda", status: "passed" },
            { id: "signed-dev-app-with-fda", status: "passed" },
            { id: "installed-helper-without-fda", status: "passed" },
            { id: "installed-helper-with-app-fda", status: "passed" },
            {
              id: "installed-helper-with-helper-specific-fda",
              status: "passed",
            },
          ],
        }),
      );

      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("requires validation evidence for every passed FDA matrix scenario", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-matrix-evidence-"),
    );
    const matrixPath = path.join(projectRoot, "docs", "helper-fda-validation-matrix.json");
    const passedScenariosWithoutEvidence = [
      { id: "unsigned-dev-app-without-fda", status: "passed" },
      { id: "signed-dev-app-without-fda", status: "passed" },
      { id: "signed-dev-app-with-fda", status: "passed" },
      { id: "installed-helper-without-fda", status: "passed" },
      { id: "installed-helper-with-app-fda", status: "passed" },
      {
        id: "installed-helper-with-helper-specific-fda",
        status: "passed",
      },
    ];
    const passedScenariosWithEvidence = passedScenariosWithoutEvidence.map(
      (scenario) => ({
        ...scenario,
        notes: `validated ${scenario.id}`,
        validatedAt: "2026-06-06T00:00:00.000Z",
        validator: "manual-fda-audit",
      }),
    );

    try {
      fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "15.0",
          scenarios: passedScenariosWithoutEvidence,
        }),
      );

      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(false);

      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "15.0",
          scenarios: passedScenariosWithEvidence,
        }),
      );

      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("does not treat missing or false environment variables as helper evidence", () => {
    expect(
      resolveHelperRegistrationPreflightInputFromEnv({
        SCAN_HELPER_TEAM_ID: "",
        SCAN_HELPER_DESIGNATED_REQUIREMENT: "   ",
        SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY: "false",
        SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY: "false",
        SCAN_HELPER_FDA_VALIDATION_MATRIX_READY: "0",
      }),
    ).toEqual({
      identity: {},
      packagingEntitlementsReady: false,
      privilegedHelperExecutableReady: false,
      privilegedHelperListenerRequirementReady: false,
      fdaValidationMatrixReady: false,
    });
  });
});
