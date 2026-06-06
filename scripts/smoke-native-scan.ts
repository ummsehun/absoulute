import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { performance } from "node:perf_hooks";
import {
  summarizeNativeSmokeComparison,
  type NativeSmokeRunSummary,
} from "../src/main/services/diagnostics/nativeSmokeSummary";

interface NativeMessage {
  type: string;
  elapsedMs?: number;
  estimated?: boolean;
  scanned?: number;
  blockedByPolicy?: number;
  blockedByPermission?: number;
  skippedByScope?: number;
  softSkippedByPolicy?: number;
  deferredByBudget?: number;
  policySkipSamples?: string[];
  permissionSamples?: string[];
  scopeSkipSamples?: string[];
  budgetDeferredSamples?: string[];
  code?: string;
}

const root = path.resolve(process.argv[2] ?? process.env.SCAN_SMOKE_ROOT ?? process.env.HOME ?? ".");
const maxDepth = Number(process.env.SCAN_SMOKE_MAX_DEPTH ?? "128");
const concurrency = Number(process.env.SCAN_SMOKE_CONCURRENCY ?? "64");
const progressIntervalMs = Number(process.env.SCAN_SMOKE_PROGRESS_INTERVAL_MS ?? "250");

if (!process.env.SCAN_NATIVE_BIN && process.env.SCAN_SMOKE_SKIP_BUILD !== "1") {
  const build = spawnSync("cargo", ["build", "--manifest-path", "native/scanner/Cargo.toml"], {
    stdio: "inherit",
  });
  if (build.status !== 0) {
    throw new Error("Failed to build native scanner before smoke scan");
  }
}

const nativeBinary = process.env.SCAN_NATIVE_BIN ?? resolveNativeScannerBinary();
if (!nativeBinary) {
  throw new Error(
    "Native scanner binary not found. Run `cargo build --manifest-path native/scanner/Cargo.toml` first.",
  );
}

const preview = await runNativeSmoke("preview");
const exact = await runNativeSmoke("exact");
const comparison = summarizeNativeSmokeComparison(preview, exact);

console.log(
  JSON.stringify(
    {
      binary: nativeBinary,
      maxDepth,
      concurrency,
      comparison,
    },
    null,
    2,
  ),
);

function resolveNativeScannerBinary(): string | null {
  const binaryName = process.platform === "win32" ? "diskviz-scanner.exe" : "diskviz-scanner";
  const modes =
    process.env.NODE_ENV === "production"
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

async function runNativeSmoke(label: "preview" | "exact"): Promise<NativeSmokeRunSummary> {
  const child = spawn(nativeBinary as string, [], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const startedAt = performance.now();
  const messages: NativeMessage[] = [];

  const done = new Promise<NativeMessage>((resolve, reject) => {
    lines.on("line", (line) => {
      const parsed = parseLine(line);
      if (!parsed) {
        return;
      }
      messages.push(parsed);
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

  child.stdin.write(`${JSON.stringify(buildStartRequest(label))}\n`);
  const doneMessage = await done;
  child.stdin.end();
  lines.close();

  return summarizeRun(label, messages, doneMessage, Math.round(performance.now() - startedAt));
}

function buildStartRequest(label: "preview" | "exact") {
  const preview = label === "preview";
  return {
    type: "start",
    scanId: `smoke-${label}-${Date.now()}`,
    root,
    mode: "deep",
    platform: process.platform,
    timeBudgetMs: preview ? 1_500 : 0,
    maxDepth,
    sameDeviceOnly: root !== path.parse(root).root,
    concurrency,
    accuracyMode: preview ? "preview" : "full",
    deepPolicyPreset: preview ? "responsive" : "exact",
    elevationPolicy: "manual",
    emitPolicy: {
      aggBatchMaxItems: 512,
      aggBatchMaxMs: 120,
      progressIntervalMs,
    },
    concurrencyPolicy: {
      min: 16,
      max: concurrency,
      adaptive: true,
    },
    skipBasenames: preview ? ["node_modules", ".git"] : [],
    softSkipPathRules: [],
    softSkipPrefixes: [],
    skipDirSuffixes: preview ? [".app"] : [],
    blockedPrefixes: [],
    permissionPrefixes: [],
  };
}

function summarizeRun(
  label: "preview" | "exact",
  messages: NativeMessage[],
  doneMessage: NativeMessage,
  elapsedMs: number,
): NativeSmokeRunSummary {
  const coverage = latest(messages, "coverage");
  const diagnostics = latest(messages, "diagnostics");
  const warnings = messages.filter((message) => message.type === "warn");

  return {
    label,
    root,
    elapsedMs,
    reportedElapsedMs: Math.round(doneMessage.elapsedMs ?? 0),
    estimated: Boolean(doneMessage.estimated),
    scanned: Math.round(coverage?.scanned ?? 0),
    blockedByPolicy: Math.round(coverage?.blockedByPolicy ?? 0),
    blockedByPermission: Math.round(coverage?.blockedByPermission ?? 0),
    skippedByScope: Math.round(coverage?.skippedByScope ?? 0),
    softSkippedByPolicy: Math.round(diagnostics?.softSkippedByPolicy ?? 0),
    deferredByBudget: Math.round(diagnostics?.deferredByBudget ?? 0),
    policySkipSamples: diagnostics?.policySkipSamples ?? [],
    permissionSamples: diagnostics?.permissionSamples ?? [],
    scopeSkipSamples: diagnostics?.scopeSkipSamples ?? [],
    budgetDeferredSamples: diagnostics?.budgetDeferredSamples ?? [],
    warnings: {
      permission: warnings.filter((message) => message.code === "E_PERMISSION").length,
      io: warnings.filter((message) => message.code === "E_IO").length,
      other: warnings.filter((message) => message.code !== "E_PERMISSION" && message.code !== "E_IO").length,
    },
  };
}

function latest(messages: NativeMessage[], type: string): NativeMessage | undefined {
  return messages.filter((message) => message.type === type).at(-1);
}

function parseLine(line: string): NativeMessage | null {
  try {
    const parsed = JSON.parse(line) as NativeMessage;
    return typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}
