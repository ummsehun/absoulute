/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
