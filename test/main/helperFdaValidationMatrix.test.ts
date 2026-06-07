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
  buildHelperFdaMatrixAudit,
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

  it("builds a blocked FDA matrix audit with missing evidence details", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-audit-"),
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
          targetMacOS: "pending",
          scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) => ({
            id,
            notes: `pending validation for ${id}`,
            status: "pending",
            validatedAt: null,
            validator: null,
          })),
        }),
      );

      expect(buildHelperFdaMatrixAudit({ projectRoot })).toEqual({
        failedScenarios: [],
        missingPassedScenarios: [...DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS],
        passedScenarioCount: 0,
        scenarioCount: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.length,
        scenariosMissingEvidence: [...DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS],
        status: "blocked",
        targetMacOS: "pending",
        targetMacOSReady: false,
      });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("builds a ready FDA matrix audit only when every scenario has passed evidence", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-audit-ready-"),
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
          scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) => ({
            id,
            notes: `validated ${id} on macOS 15.0`,
            status: "passed",
            validatedAt: "2026-06-08T00:00:00.000Z",
            validator: "manual-fda-audit",
          })),
        }),
      );

      expect(buildHelperFdaMatrixAudit({ projectRoot })).toEqual({
        failedScenarios: [],
        missingPassedScenarios: [],
        passedScenarioCount: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.length,
        scenarioCount: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.length,
        scenariosMissingEvidence: [],
        status: "ready",
        targetMacOS: "15.0",
        targetMacOSReady: true,
      });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not carry passed FDA evidence across target macOS versions", () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "diskviz-helper-fda-target-change-"),
    );
    const matrixPath = path.join(
      projectRoot,
      "docs",
      "helper-fda-validation-matrix.json",
    );
    const passedScenarios = DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) => ({
      id,
      notes: `validated ${id} on macOS 15.0`,
      status: "passed",
      validatedAt: "2026-06-06T00:00:00.000Z",
      validator: "manual-fda-audit",
    }));

    try {
      fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
      fs.writeFileSync(
        matrixPath,
        JSON.stringify({
          targetMacOS: "15.0",
          scenarios: passedScenarios,
        }),
      );

      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(true);

      recordHelperFdaScenario({
        notes: "validated signed app with Full Disk Access on macOS 15.1",
        projectRoot,
        scenarioId: "signed-dev-app-with-fda",
        status: "passed",
        targetMacOS: "15.1",
        validatedAt: "2026-06-07T00:00:00.000Z",
        validator: "manual-fda-audit",
      });

      const matrix = listHelperFdaScenarios({ projectRoot });

      expect(matrix.targetMacOS).toBe("15.1");
      expect(resolveFdaValidationMatrixEvidence(projectRoot)).toBe(false);
      expect(matrix.scenarios).toEqual(
        DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((id) =>
          id === "signed-dev-app-with-fda"
            ? {
              id,
              notes: "validated signed app with Full Disk Access on macOS 15.1",
              status: "passed",
              validatedAt: "2026-06-07T00:00:00.000Z",
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
      );
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
    expect(packageJson.scripts?.["audit:helper-fda-matrix"]).toBe(
      "bun run scripts/audit-helper-fda-matrix.ts",
    );
  });
});
