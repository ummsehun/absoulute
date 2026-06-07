import fs from "node:fs";
import path from "node:path";
import {
  DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH,
  DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS,
  isConcreteMacOsVersion,
} from "./helperRegistration";

export type HelperFdaScenarioStatus = "passed" | "failed" | "pending";

export interface HelperFdaScenarioRecord {
  id: string;
  notes: string;
  status: HelperFdaScenarioStatus;
  validatedAt: string | null;
  validator: string | null;
}

export interface HelperFdaValidationMatrix {
  targetMacOS: string;
  scenarios: HelperFdaScenarioRecord[];
}

export interface RecordHelperFdaScenarioInput {
  notes: string;
  projectRoot?: string;
  scenarioId: string;
  status: HelperFdaScenarioStatus;
  targetMacOS: string;
  validatedAt: string;
  validator: string;
}

export interface RecordHelperFdaScenarioResult {
  matrixPath: string;
  scenario: HelperFdaScenarioRecord;
  targetMacOS: string;
}

export interface ListHelperFdaScenariosInput {
  projectRoot?: string;
}

export function listHelperFdaScenarios(
  input: ListHelperFdaScenariosInput = {},
): HelperFdaValidationMatrix {
  const projectRoot = input.projectRoot ?? process.cwd();
  const matrixPath = path.join(
    projectRoot,
    DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH,
  );
  const matrix = readMatrix(matrixPath);
  const scenariosById = new Map(
    matrix.scenarios.map((scenario) => [scenario.id, scenario]),
  );

  return {
    targetMacOS: matrix.targetMacOS,
    scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((scenarioId) =>
      scenariosById.get(scenarioId) ?? {
        id: scenarioId,
        notes: "",
        status: "pending",
        validatedAt: null,
        validator: null,
      }
    ),
  };
}

export function recordHelperFdaScenario(
  input: RecordHelperFdaScenarioInput,
): RecordHelperFdaScenarioResult {
  if (!isRequiredFdaScenario(input.scenarioId)) {
    throw new Error(`unsupported FDA scenario: ${input.scenarioId}`);
  }
  if (!isConcreteMacOsVersion(input.targetMacOS)) {
    throw new Error("target macOS must be a concrete version");
  }
  if (!isIsoDateTime(input.validatedAt)) {
    throw new Error("validatedAt must be an ISO datetime");
  }
  if (!hasNonEmptyText(input.validator)) {
    throw new Error("validator is required");
  }
  if (!hasNonEmptyText(input.notes)) {
    throw new Error("notes are required");
  }

  const projectRoot = input.projectRoot ?? process.cwd();
  const matrixPath = path.join(
    projectRoot,
    DISK_SCAN_HELPER_FDA_MATRIX_SOURCE_RELATIVE_PATH,
  );
  const matrix = listHelperFdaScenarios({ projectRoot });
  const scenario = {
    id: input.scenarioId,
    notes: input.notes.trim(),
    status: input.status,
    validatedAt: input.status === "pending" ? null : input.validatedAt,
    validator: input.status === "pending" ? null : input.validator.trim(),
  };
  const preserveExistingScenarios = matrix.targetMacOS === "pending"
    || matrix.targetMacOS === input.targetMacOS;
  const scenariosById = new Map(
    preserveExistingScenarios
      ? matrix.scenarios.map((existingScenario) => [
        existingScenario.id,
        existingScenario,
      ])
      : [],
  );
  scenariosById.set(input.scenarioId, scenario);

  const updatedMatrix: HelperFdaValidationMatrix = {
    targetMacOS: input.targetMacOS,
    scenarios: DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.map((scenarioId) =>
      scenariosById.get(scenarioId) ?? {
        id: scenarioId,
        notes: "",
        status: "pending",
        validatedAt: null,
        validator: null,
      }
    ),
  };

  fs.mkdirSync(path.dirname(matrixPath), { recursive: true });
  fs.writeFileSync(matrixPath, `${JSON.stringify(updatedMatrix, null, 2)}\n`);

  return {
    matrixPath,
    scenario,
    targetMacOS: updatedMatrix.targetMacOS,
  };
}

function readMatrix(matrixPath: string): HelperFdaValidationMatrix {
  try {
    const parsed = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as {
      scenarios?: Array<Partial<HelperFdaScenarioRecord>>;
      targetMacOS?: string;
    };

    return {
      targetMacOS: typeof parsed.targetMacOS === "string"
        ? parsed.targetMacOS
        : "pending",
      scenarios: parsed.scenarios
        ?.filter((scenario) => typeof scenario.id === "string")
        .map((scenario) => ({
          id: scenario.id as string,
          notes: typeof scenario.notes === "string" ? scenario.notes : "",
          status: isScenarioStatus(scenario.status)
            ? scenario.status
            : "pending",
          validatedAt: typeof scenario.validatedAt === "string"
            ? scenario.validatedAt
            : null,
          validator: typeof scenario.validator === "string"
            ? scenario.validator
            : null,
        })) ?? [],
    };
  } catch {
    return {
      targetMacOS: "pending",
      scenarios: [],
    };
  }
}

function isRequiredFdaScenario(
  value: string,
): value is typeof DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS[number] {
  return DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS.includes(
    value as typeof DISK_SCAN_HELPER_REQUIRED_FDA_SCENARIOS[number],
  );
}

function isScenarioStatus(value: unknown): value is HelperFdaScenarioStatus {
  return value === "passed" || value === "failed" || value === "pending";
}

function hasNonEmptyText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTime(value: string | undefined): value is string {
  if (!hasNonEmptyText(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && value.includes("T");
}
