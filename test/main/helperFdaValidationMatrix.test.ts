/* @vitest-environment node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS,
  resolveFdaValidationMatrixEvidence,
} from "../../src/main/services/helper/helperRegistration";
import {
  listHelperFdaScenarios,
  recordHelperFdaScenario,
} from "../../src/main/services/helper/helperFdaValidationMatrix";

describe("helperFdaValidationMatrix", () => {
  it("records validated evidence for a required FDA scenario", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-record-"),
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
        JSON.stringify(
          {
            targetMacOS: "pending",
            scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) => ({
              id,
              status: "pending",
              validatedAt: null,
              validator: null,
              notes: "",
            })),
          },
          null,
          2,
        ),
      );

      const result = recordHelperFdaScenario({
        notes: "validated signed app with Full Disk Access on protected roots",
        projectRoot,
        scenarioId: "signed-dev-app-with-fda",
        status: "passed",
        targetMacOS: "15.0",
        validatedAt: "2026-06-06T00:00:00.000Z",
        validator: "manual-fda-audit",
      });

      expect(result.scenario).toEqual({
        id: "signed-dev-app-with-fda",
        notes: "validated signed app with Full Disk Access on protected roots",
        status: "passed",
        validatedAt: "2026-06-06T00:00:00.000Z",
        validator: "manual-fda-audit",
      });
      expect(result.targetMacOS).toBe("15.0");

      const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as {
        targetMacOS?: string;
        scenarios?: Array<{
          id?: string;
          notes?: string;
          status?: string;
          validatedAt?: string | null;
          validator?: string | null;
        }>;
      };
      expect(matrix.targetMacOS).toBe("15.0");
      expect(matrix.scenarios?.find((scenario) =>
        scenario.id === "signed-dev-app-with-fda"
      )).toEqual(result.scenario);
      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects unknown scenarios and non-concrete target macOS versions", () => {
    expect(() =>
      recordHelperFdaScenario({
        notes: "validated",
        projectRoot: process.cwd(),
        scenarioId: "unknown-scenario",
        status: "passed",
        targetMacOS: "15.0",
        validatedAt: "2026-06-06T00:00:00.000Z",
        validator: "manual-fda-audit",
      })
    ).toThrow("unsupported FDA scenario");

    expect(() =>
      recordHelperFdaScenario({
        notes: "validated",
        projectRoot: process.cwd(),
        scenarioId: "signed-dev-app-with-fda",
        status: "passed",
        targetMacOS: "pending",
        validatedAt: "2026-06-06T00:00:00.000Z",
        validator: "manual-fda-audit",
      })
    ).toThrow("target macOS must be a concrete version");
  });

  it("lists required FDA scenarios with current matrix status", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-list-"),
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
          targetMacOS: "15.0",
          scenarios: [
            {
              id: "signed-dev-app-with-fda",
              notes: "validated",
              status: "passed",
              validatedAt: "2026-06-06T00:00:00.000Z",
              validator: "manual-fda-audit",
            },
          ],
        }),
      );

      expect(listHelperFdaScenarios({ projectRoot })).toEqual({
        targetMacOS: "15.0",
        scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) =>
          id === "signed-dev-app-with-fda"
            ? {
              id,
              notes: "validated",
              status: "passed",
              validatedAt: "2026-06-06T00:00:00.000Z",
              validator: "manual-fda-audit",
            }
            : {
              id,
              notes: "",
              status: "pending",
              validatedAt: null,
              validator: null,
            }
        ),
      });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("exposes the FDA matrix recorder as a package script", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["record:helper-fda-scenario"]).toBe(
      "bun run scripts/record-helper-fda-scenario.ts",
    );
  });
});
