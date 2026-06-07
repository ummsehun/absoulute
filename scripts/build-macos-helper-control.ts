import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const sourcePath = join(
  process.cwd(),
  "native",
  "macos-helper",
  "control",
  "main.swift",
);
const outputPath = join(
  process.cwd(),
  "resources",
  "bin",
  "helper-control-macos",
);
const moduleCachePath = join(
  process.cwd(),
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
