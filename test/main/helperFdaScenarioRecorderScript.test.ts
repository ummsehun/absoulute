/* @vitest-environment node */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("record-helper-fda-scenario script", () => {
  it("records a scenario under an explicit project root", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-record-script-"),
    );
    const matrixPath = path.join(
      projectRoot,
      "docs",
      "helper-fda-validation-matrix.json",
    );

    try {
      const result = runRecorder([
        "--project-root",
        projectRoot,
        "--scenario",
        "signed-dev-app-with-fda",
        "--target-macos",
        "15.0",
        "--validator",
        "manual-fda-audit",
        "--notes",
        "validated signed development app with Full Disk Access",
        "--validated-at",
        "2026-06-08T00:00:00.000Z",
      ]);

      expect(result.status).toBe(0);
      const stdoutResult = JSON.parse(result.stdout);
      const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
      expect(stdoutResult.matrixPath).toBe(matrixPath);
      expect(matrix.targetMacOS).toBe("15.0");
      expect(matrix.scenarios).toContainEqual({
        id: "signed-dev-app-with-fda",
        notes: "validated signed development app with Full Disk Access",
        status: "passed",
        validatedAt: "2026-06-08T00:00:00.000Z",
        validator: "manual-fda-audit",
      });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("writes the recorder result to an explicit output file", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-record-out-"),
    );
    const outputPath = path.join(projectRoot, "out", "record-result.json");

    try {
      const result = runRecorder([
        "--project-root",
        projectRoot,
        "--out",
        outputPath,
        "--scenario",
        "installed-helper-without-fda",
        "--target-macos",
        "15.0",
        "--validator",
        "manual-fda-audit",
        "--notes",
        "validated installed helper without Full Disk Access",
        "--validated-at",
        "2026-06-08T00:00:00.000Z",
      ]);

      expect(result.status).toBe(0);
      const stdoutResult = JSON.parse(result.stdout);
      const fileResult = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      expect(fileResult).toEqual(stdoutResult);
      expect(fileResult.scenario.id).toBe("installed-helper-without-fda");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("lists scenarios from an explicit project root", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-list-script-"),
    );
    const matrixPath = path.join(
      projectRoot,
      "docs",
      "helper-fda-validation-matrix.json",
    );

    try {
      fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "15.1",
          scenarios: [
            {
              id: "signed-dev-app-with-fda",
              notes: "validated from explicit project root",
              status: "passed",
              validatedAt: "2026-06-08T00:00:00.000Z",
              validator: "manual-fda-audit",
            },
          ],
        }),
      );

      const result = runRecorder([
        "--list",
        "--project-root",
        projectRoot,
      ]);

      expect(result.status).toBe(0);
      const stdoutList = JSON.parse(result.stdout);
      expect(stdoutList.targetMacOS).toBe("15.1");
      expect(stdoutList.scenarios).toContainEqual(expect.objectContaining({
        id: "signed-dev-app-with-fda",
        notes: "validated from explicit project root",
        status: "passed",
      }));
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

function runRecorder(args: string[]) {
  return spawnSync(
    "bun",
    ["run", "scripts/record-helper-fda-scenario.ts", ...args],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    },
  );
}
