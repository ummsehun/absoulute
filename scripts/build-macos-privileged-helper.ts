import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildHelperCodeSigningRequirement,
} from "../src/main/services/helper/helperRegistration";

const rawArgs = process.argv.slice(2);
const projectRoot = resolveOptionalArg(rawArgs, "--project-root") ?? process.cwd();
const sourcePath = join(
  projectRoot,
  "native",
  "macos-helper",
  "privileged-helper",
  "main.swift",
);
const traversalSourcePath = join(
  projectRoot,
  "native",
  "macos-helper",
  "privileged-helper",
  "enumerateTraversal.swift",
);
const outputPath = join(
  projectRoot,
  "resources",
  "helper",
  "LaunchServices",
  "com.example.diskvisualizer.privileged-helper",
);
const requirementMetadataPath = `${outputPath}.requirement.json`;
const moduleCachePath = join(
  projectRoot,
  ".tmp",
  "swift-module-cache",
);
const generatedSourcePath = join(
  projectRoot,
  ".tmp",
  "swift-generated",
  "privileged-helper-main.swift",
);
const teamId = process.env.SCAN_HELPER_TEAM_ID?.trim();
const effectiveTeamId = isValidAppleTeamIdText(teamId)
  ? teamId
  : "TEAMID_NOT_CONFIGURED";
const requirement = isValidAppleTeamIdText(teamId)
  ? buildHelperCodeSigningRequirement(teamId)
  : `identifier "com.example.diskvisualizer" and anchor apple generic and certificate leaf[subject.OU] = "${effectiveTeamId}"`;

mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(moduleCachePath, { recursive: true });
mkdirSync(dirname(generatedSourcePath), { recursive: true });

const generatedSource = readFileSync(sourcePath, "utf8").replace(
  "TEAMID_NOT_CONFIGURED",
  effectiveTeamId,
);
writeFileSync(generatedSourcePath, generatedSource);

const result = spawnSync(
  "swiftc",
  [
    "-target",
    "arm64-apple-macosx13.0",
    "-O",
    "-o",
    outputPath,
    generatedSourcePath,
    traversalSourcePath,
  ],
  {
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: moduleCachePath,
    },
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

writeFileSync(
  requirementMetadataPath,
  `${JSON.stringify({
    ready: isValidAppleTeamIdText(teamId),
    requirement,
    teamId: effectiveTeamId,
  }, null, 2)}\n`,
);

function isValidAppleTeamIdText(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Z0-9]{10}$/.test(value);
}

function resolveOptionalArg(
  rawArgs: string[],
  name: string,
): string | undefined {
  const index = rawArgs.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  const value = rawArgs[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    throw new Error(`missing value for ${name}`);
  }

  return value;
}
