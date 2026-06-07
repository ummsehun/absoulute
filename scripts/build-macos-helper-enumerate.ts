import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const rawArgs = process.argv.slice(2);
const projectRoot = resolveOptionalArg(rawArgs, "--project-root") ?? process.cwd();
const sourcePath = join(
  projectRoot,
  "native",
  "macos-helper",
  "enumerate",
  "main.swift",
);
const outputPath = join(
  projectRoot,
  "resources",
  "bin",
  "helper-enumerate-macos",
);
const moduleCachePath = join(
  projectRoot,
  ".tmp",
  "swift-module-cache",
);

mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(moduleCachePath, { recursive: true });

const result = spawnSync(
  "swiftc",
  [
    "-target",
    "arm64-apple-macosx13.0",
    "-O",
    "-o",
    outputPath,
    sourcePath,
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
