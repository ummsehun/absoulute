import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HELPER_TRANSPORT_ENV,
} from "../src/main/services/helper/helperClient";
import {
  HELPER_ENUMERATE_BIN_ENV,
} from "../src/main/services/helper/macosHelperEnumerateCommand";
import {
  NativeScanOrchestrator,
  SCAN_HELPER_PROTOTYPE_ENUMERATE_ENV,
  type NativeStageHandlers,
} from "../src/main/services/scan/nativeScanOrchestrator";
import { resolveScanOptions } from "../src/main/services/scan/scanRuntimeOptions";
import {
  summarizeHelperPrototypeAudit,
  type HelperPrototypeAuditLogEvent,
} from "../src/main/services/diagnostics/helperPrototypeAuditSummary";

const roots = resolveRoots();
const maxDepth = Number(process.env.SCAN_HELPER_AUDIT_MAX_DEPTH ?? "16");
const helperBinary = path.resolve(
  process.env[HELPER_ENUMERATE_BIN_ENV]
    ?? path.join("resources", "bin", "helper-enumerate-macos"),
);

process.env[HELPER_TRANSPORT_ENV] = "xpc";
process.env[HELPER_ENUMERATE_BIN_ENV] = helperBinary;
process.env[SCAN_HELPER_PROTOTYPE_ENUMERATE_ENV] = "1";

if (!fs.existsSync(helperBinary)) {
  throw new Error(`helper enumerate binary not found: ${helperBinary}`);
}

const summaries = [];
for (const root of roots) {
  summaries.push(await auditRoot(path.resolve(root)));
}

console.log(
  JSON.stringify(
    {
      helperBinary,
      maxDepth,
      summaries,
    },
    null,
    2,
  ),
);

function resolveRoots(): string[] {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (args.length > 0) {
    return args;
  }

  const envRoots = process.env.SCAN_HELPER_AUDIT_ROOTS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (envRoots && envRoots.length > 0) {
    return envRoots;
  }

  return [process.env.HOME ?? os.homedir()];
}

async function auditRoot(root: string) {
  const logDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "diskviz-helper-audit-log-"),
  );
  const previousLogDir = process.env.SCAN_LOG_DIR;
  process.env.SCAN_LOG_DIR = logDir;

  const handlers = createRecordingHandlers();
  try {
    const orchestrator = new NativeScanOrchestrator();
    const result = await orchestrator.runStage(
      {
        scanId: `helper-audit-${Date.now()}`,
        rootPath: root,
        permissionDeniedRoots: [],
        paused: false,
        cancelled: false,
        options: resolveScanOptions(
          {
            rootPath: root,
            optInProtected: false,
            accuracyMode: "full",
          },
          root,
        ),
      },
      {
        mode: "deep",
        maxDepth,
        timeBudgetMs: 0,
      },
      handlers,
    );

    return summarizeHelperPrototypeAudit({
      root,
      maxDepth,
      result,
      helperPlans: handlers.helperPlans,
      aggBatches: handlers.aggBatches,
      coverage: handlers.coverage,
      done: handlers.done,
      progress: handlers.progress,
      warnings: handlers.warnings,
      logEvents: readLogEvents(logDir),
    });
  } finally {
    if (previousLogDir === undefined) {
      delete process.env.SCAN_LOG_DIR;
    } else {
      process.env.SCAN_LOG_DIR = previousLogDir;
    }
    fs.rmSync(logDir, { recursive: true, force: true });
  }
}

function createRecordingHandlers(): NativeStageHandlers & {
  aggBatches: Parameters<NativeStageHandlers["onAggBatch"]>[0][];
  coverage: Parameters<NativeStageHandlers["onCoverage"]>[0][];
  done: Parameters<NativeStageHandlers["onDone"]>[0][];
  helperPlans: NonNullable<NativeStageHandlers["onHelperPlan"]> extends (
    message: infer T,
  ) => void
    ? T[]
    : never;
  progress: Parameters<NativeStageHandlers["onProgress"]>[0][];
  warnings: Parameters<NativeStageHandlers["onWarn"]>[0][];
} {
  const aggBatches: Parameters<NativeStageHandlers["onAggBatch"]>[0][] = [];
  const coverage: Parameters<NativeStageHandlers["onCoverage"]>[0][] = [];
  const done: Parameters<NativeStageHandlers["onDone"]>[0][] = [];
  const helperPlans: NonNullable<NativeStageHandlers["onHelperPlan"]> extends (
    message: infer T,
  ) => void
    ? T[]
    : never = [];
  const progress: Parameters<NativeStageHandlers["onProgress"]>[0][] = [];
  const warnings: Parameters<NativeStageHandlers["onWarn"]>[0][] = [];

  return {
    aggBatches,
    coverage,
    done,
    helperPlans,
    progress,
    warnings,
    onAgg: () => undefined,
    onAggBatch: (message) => aggBatches.push(message),
    onCoverage: (message) => coverage.push(message),
    onDiagnostics: () => undefined,
    onDone: (message) => done.push(message),
    onElevationRequired: () => undefined,
    onHelperPlan: (message) => helperPlans.push(message),
    onProgress: (message) => progress.push(message),
    onQuickReady: () => undefined,
    onWarn: (message) => warnings.push(message),
  };
}

function readLogEvents(logDir: string): HelperPrototypeAuditLogEvent[] {
  const logPath = path.join(logDir, "native-scanner.jsonl");
  if (!fs.existsSync(logPath)) {
    return [];
  }

  return fs.readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HelperPrototypeAuditLogEvent);
}
