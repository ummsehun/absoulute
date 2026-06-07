/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DISK_SCAN_HELPER_REQUIREMENT_METADATA_SOURCE_RELATIVE_PATH } from "../../src/main/services/helper/helperRegistration";

describe("audit-helper-readiness script", () => {
  const itOnDarwin = process.platform === "darwin" ? it : it.skip;

  it("writes the readiness report to an explicit output file", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-readiness-out-"),
    );
    const outputPath = path.join(tempDir, "nested", "readiness.json");

    try {
      const result = spawnSync(
        "bun",
        ["run", "scripts/audit-helper-readiness.ts", "--out", outputPath],
        {
          cwd: process.cwd(),
          env: process.env,
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      const stdoutReport = JSON.parse(result.stdout);
      const fileReport = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      expect(fileReport).toEqual(stdoutReport);
      expect(fileReport.status).toBe("blocked");
      expect(fileReport.canEnableHelperByDefault).toBe(false);
      expect(fileReport.evidence).toContainEqual(expect.objectContaining({
        artifactReady: true,
        confirmationReady: false,
        effectiveReady: false,
        key: "xpc-enumerate-bridge",
      }));
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("uses an explicit ServiceManagement probe binary option", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-readiness-probe-bin-"),
    );
    const probePath = path.join(tempDir, "sm-probe");

    try {
      fs.writeFileSync(
        probePath,
        "#!/bin/sh\nprintf '%s\\n' '{\"state\":\"pending-approval\",\"reason\":\"requires-approval\"}'\n",
      );
      fs.chmodSync(probePath, 0o755);

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-readiness.ts",
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
      const report = JSON.parse(result.stdout);
      expect(report.serviceManagementStatus).toBe("pending-approval");
      expect(report.evidence).toContainEqual(expect.objectContaining({
        key: "service-management",
        reason: "service-management-not-registered:pending-approval",
        status: "fail",
      }));
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("uses an explicit resources path for the packaged probe", () => {
    const resourcesRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-readiness-resources-"),
    );
    const probePath = path.join(
      resourcesRoot,
      "bin",
      "service-management-probe-macos",
    );

    try {
      fs.mkdirSync(path.dirname(probePath), { recursive: true });
      fs.writeFileSync(
        probePath,
        "#!/bin/sh\nprintf '%s\\n' '{\"state\":\"not-installed\",\"reason\":\"not-found\"}'\n",
      );
      fs.chmodSync(probePath, 0o755);

      const result = spawnSync(
        "bun",
        [
          "run",
          "scripts/audit-helper-readiness.ts",
          "--platform",
          "darwin",
          "--resources-path",
          resourcesRoot,
        ],
        {
          cwd: process.cwd(),
          env: process.env,
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.serviceManagementStatus).toBe("not-installed");
      expect(report.evidence).toContainEqual(expect.objectContaining({
        key: "service-management",
        reason: "service-management-not-registered:not-installed",
        status: "fail",
      }));
    } finally {
      fs.rmSync(resourcesRoot, { force: true, recursive: true });
    }
  });

  it("uses explicit project root and identity options", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-readiness-identity-root-"),
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
          "scripts/audit-helper-readiness.ts",
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
          env: {
            ...process.env,
            SCAN_HELPER_PACKAGING_ENTITLEMENTS_READY: "true",
            SCAN_HELPER_PRIVILEGED_EXECUTABLE_READY: "true",
            SCAN_HELPER_XPC_ENUMERATE_BRIDGE_READY: "true",
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.serviceManagementStatus).toBe("registered");
      expect(report.evidence).toContainEqual(expect.objectContaining({
        key: "service-management",
        reason: "registered",
        status: "pass",
      }));
      expect(report.blockers).not.toContain("team-id-missing");
      expect(report.blockers).not.toContain("designated-requirement-missing");
      expect(report.blockers).not.toContain(
        "privileged-helper-listener-requirement-missing",
      );
      expect(report.blockers).toEqual([
        "fda-validation-matrix-missing",
        "helper-xpc-enumerate-bridge-missing",
        "packaging-entitlements-missing",
        "privileged-helper-executable-missing",
      ]);
      expect(report.canEnableHelperByDefault).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { force: true, recursive: true });
    }
  });

  it("uses explicit artifact confirmation flags", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-readiness.ts",
        "--platform",
        "darwin",
        "--resources-path",
        "resources",
        "--confirm-packaging-entitlements",
        "--confirm-privileged-helper-executable",
        "--confirm-helper-xpc-enumerate-bridge",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.canEnableHelperByDefault).toBe(false);
    expect(report.blockers).not.toContain("packaging-entitlements-missing");
    expect(report.blockers).not.toContain("privileged-helper-executable-missing");
    expect(report.blockers).not.toContain("helper-xpc-enumerate-bridge-missing");
    expect(report.evidence).not.toContainEqual(expect.objectContaining({
      key: "packaging-entitlements",
      status: "fail",
    }));
    expect(report.evidence).not.toContainEqual(expect.objectContaining({
      key: "privileged-helper-executable",
      status: "fail",
    }));
    expect(report.evidence).not.toContainEqual(expect.objectContaining({
      key: "xpc-enumerate-bridge",
      status: "fail",
    }));
  });

  it("fails explicitly when project root is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-readiness.ts", "--project-root"],
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
        "scripts/audit-helper-readiness.ts",
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

  it("fails explicitly when team id is missing", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/audit-helper-readiness.ts", "--team-id"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing value for --team-id");
  });

  it("fails explicitly when designated requirement is followed by another option", () => {
    const result = spawnSync(
      "bun",
      [
        "run",
        "scripts/audit-helper-readiness.ts",
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

  itOnDarwin("uses the ServiceManagement probe state in the readiness report", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-readiness-script-"),
    );
    const probePath = path.join(tempDir, "sm-probe");

    try {
      fs.writeFileSync(
        probePath,
        "#!/bin/sh\nprintf '%s\\n' '{\"state\":\"pending-approval\",\"reason\":\"requires-approval\"}'\n",
      );
      fs.chmodSync(probePath, 0o755);

      const result = spawnSync(
        "bun",
        ["run", "scripts/audit-helper-readiness.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            SCAN_HELPER_SM_PROBE_BIN: probePath,
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.serviceManagementStatus).toBe("pending-approval");
      expect(report.evidence).toContainEqual(expect.objectContaining({
        key: "service-management",
        reason: "service-management-not-registered:pending-approval",
        status: "fail",
      }));
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
