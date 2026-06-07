import {
  listHelperFdaScenarios,
  recordHelperFdaScenario,
  type HelperFdaScenarioStatus,
} from "../src/main/services/helper/helperFdaValidationMatrix";
import {
  resolveAuditOutputPath,
  writeAuditOutputFile,
} from "./helper-audit-output";

const args = parseArgs(process.argv.slice(2));
const outputPath = resolveAuditOutputPath(process.argv.slice(2));
const projectRoot = args["project-root"];

if (args.list === "true") {
  const listJson = JSON.stringify(listHelperFdaScenarios({ projectRoot }), null, 2);
  console.log(listJson);
  writeAuditOutputFile(outputPath, listJson);
  process.exit(0);
}

const result = recordHelperFdaScenario({
  notes: requireArg(args, "notes"),
  projectRoot,
  scenarioId: requireArg(args, "scenario"),
  status: readStatus(args.status),
  targetMacOS: requireArg(args, "target-macos"),
  validatedAt: args["validated-at"] ?? new Date().toISOString(),
  validator: requireArg(args, "validator"),
});

const resultJson = JSON.stringify(result, null, 2);
console.log(resultJson);
writeAuditOutputFile(outputPath, resultJson);

function parseArgs(rawArgs: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const key = rawArgs[index];
    if (!key?.startsWith("--")) {
      continue;
    }
    if (key === "--list") {
      parsed.list = "true";
      continue;
    }

    const value = rawArgs[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${key}`);
    }
    parsed[key.slice(2)] = value;
    index += 1;
  }

  return parsed;
}

function requireArg(args: Record<string, string>, name: string): string {
  const value = args[name]?.trim();
  if (!value) {
    throw new Error(`missing required argument --${name}`);
  }

  return value;
}

function readStatus(value: string | undefined): HelperFdaScenarioStatus {
  if (value === undefined) {
    return "passed";
  }
  if (value === "passed" || value === "failed" || value === "pending") {
    return value;
  }

  throw new Error(`unsupported status: ${value}`);
}
