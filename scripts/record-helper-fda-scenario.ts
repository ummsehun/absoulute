import {
  listHelperFdaScenarios,
  recordHelperFdaScenario,
  type HelperFdaScenarioStatus,
} from "../src/main/services/helper/helperFdaValidationMatrix";

const args = parseArgs(process.argv.slice(2));
if (args.list === "true") {
  console.log(JSON.stringify(listHelperFdaScenarios(), null, 2));
  process.exit(0);
}

const result = recordHelperFdaScenario({
  notes: requireArg(args, "notes"),
  scenarioId: requireArg(args, "scenario"),
  status: readStatus(args.status),
  targetMacOS: requireArg(args, "target-macos"),
  validatedAt: args["validated-at"] ?? new Date().toISOString(),
  validator: requireArg(args, "validator"),
});

console.log(JSON.stringify(result, null, 2));

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
