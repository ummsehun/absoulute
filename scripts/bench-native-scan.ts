import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { performance } from "node:perf_hooks";

interface NativeMessage {
  type: string;
  elapsedMs?: number;
  estimated?: boolean;
  scanned?: number;
  blockedByPolicy?: number;
  blockedByPermission?: number;
  skippedByScope?: number;
}

const fixtureRoot = path.resolve(".tmp-tests", "native-bench-fixture");
if (!process.env.SCAN_NATIVE_BIN && process.env.SCAN_BENCH_SKIP_BUILD !== "1") {
  const build = spawnSync("cargo", ["build", "--manifest-path", "native/scanner/Cargo.toml"], {
    stdio: "inherit",
  });
  if (build.status !== 0) {
    throw new Error("Failed to build native scanner before benchmark");
  }
}

const nativeBinary = process.env.SCAN_NATIVE_BIN ?? resolveNativeScannerBinary();

if (!nativeBinary) {
  throw new Error("Native scanner binary not found. Run `cargo build --manifest-path native/scanner/Cargo.toml` first.");
}

await prepareFixture(fixtureRoot);

const runs = Number(process.env.SCAN_BENCH_RUNS ?? "3");
const results: Array<{
  elapsedMs: number;
  reportedElapsedMs: number;
  scanned: number;
  estimated: boolean;
}> = [];

for (let index = 0; index < runs; index += 1) {
  results.push(await runNativeScan(fixtureRoot));
}

const elapsed = results.map((item) => item.elapsedMs).sort((left, right) => left - right);
const median = elapsed[Math.floor(elapsed.length / 2)] ?? 0;
const average = elapsed.reduce((sum, value) => sum + value, 0) / Math.max(1, elapsed.length);

console.log(
  JSON.stringify(
    {
      binary: nativeBinary,
      fixtureRoot,
      runs,
      averageMs: Math.round(average),
      medianMs: Math.round(median),
      results,
    },
    null,
    2,
  ),
);

async function prepareFixture(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
  const directories = Array.from({ length: 24 }, (_, index) =>
    path.join(root, `dir-${String(index).padStart(2, "0")}`),
  );
  await Promise.all(directories.map((directory) => fs.mkdir(directory, { recursive: true })));

  const writes: Array<Promise<void>> = [];
  for (const [dirIndex, directory] of directories.entries()) {
    for (let fileIndex = 0; fileIndex < 180; fileIndex += 1) {
      const payload = `dir=${dirIndex} file=${fileIndex}\n`.repeat(8);
      writes.push(
        fs.writeFile(
          path.join(directory, `file-${String(fileIndex).padStart(3, "0")}.txt`),
          payload,
        ),
      );
    }
  }
  await Promise.all(writes);
}

function resolveNativeScannerBinary(): string | null {
  const binaryName = process.platform === "win32" ? "diskviz-scanner.exe" : "diskviz-scanner";
  const modes = process.env.NODE_ENV === "production"
    ? (["release", "debug"] as const)
    : (["debug", "release"] as const);
  for (const mode of modes) {
    const candidate = path.resolve("native", "scanner", "target", mode, binaryName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function runNativeScan(root: string): Promise<{
  elapsedMs: number;
  reportedElapsedMs: number;
  scanned: number;
  estimated: boolean;
}> {
  const child = spawn(nativeBinary, [], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let latestCoverage: NativeMessage | null = null;
  const startedAt = performance.now();

  const done = new Promise<NativeMessage>((resolve, reject) => {
    lines.on("line", (line) => {
      const parsed = parseLine(line);
      if (!parsed) {
        return;
      }
      if (parsed.type === "coverage") {
        latestCoverage = parsed;
      }
      if (parsed.type === "done") {
        resolve(parsed);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`native scanner exited with ${String(code)}: ${stderr.trim()}`));
      }
    });
  });

  child.stdin.write(`${JSON.stringify(buildStartRequest(root))}\n`);
  const message = await done;
  child.stdin.end();
  lines.close();

  return {
    elapsedMs: Math.round(performance.now() - startedAt),
    reportedElapsedMs: Math.round(message.elapsedMs ?? 0),
    scanned: Math.round(latestCoverage?.scanned ?? 0),
    estimated: Boolean(message.estimated),
  };
}

function buildStartRequest(root: string) {
  return {
    type: "start",
    scanId: `bench-${Date.now()}`,
    root,
    mode: "deep",
    platform: process.platform,
    timeBudgetMs: 0,
    maxDepth: 128,
    sameDeviceOnly: true,
    concurrency: 64,
    accuracyMode: "full",
    deepPolicyPreset: "exact",
    elevationPolicy: "manual",
    emitPolicy: {
      aggBatchMaxItems: 512,
      aggBatchMaxMs: 120,
      progressIntervalMs: 120,
    },
    concurrencyPolicy: {
      min: 16,
      max: 64,
      adaptive: true,
    },
    skipBasenames: [],
    softSkipPathRules: [],
    softSkipPrefixes: [],
    skipDirSuffixes: [],
    blockedPrefixes: [],
    permissionPrefixes: [],
  };
}

function parseLine(line: string): NativeMessage | null {
  try {
    const parsed = JSON.parse(line) as NativeMessage;
    return typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}
