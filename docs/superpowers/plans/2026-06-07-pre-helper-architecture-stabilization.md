# Pre-Helper Architecture Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the pre-helper stabilization phase so privileged-helper work can continue without increasing architectural coupling.

**Architecture:** Keep helper execution disabled by default while moving helper selection, native protocol parsing, scan stage handling, shared contract checks, and readiness evidence behind focused boundaries. Do not add helper lifecycle state to `DiskScanService`, `registerIpcHandlers`, `useScanLogic`, or `src/shared`.

**Tech Stack:** Electron main process, TypeScript, zod, Vitest, Rust native scanner, Swift helper prototype, pnpm.

---

## File Structure

- Create: `src/main/services/native/nativeScannerProtocol.ts`
  - Owns native scanner message types, start payload creation, line parsing, safe counter coercion, and message summarization.
- Modify: `src/main/services/native/nativeRustScannerClient.ts`
  - Keeps binary resolution and child-process/session lifecycle only. Imports parser and protocol helpers from `nativeScannerProtocol.ts`.
- Create: `test/main/nativeScannerProtocolParser.test.ts`
  - Fast unit tests for parser clamping, malformed lines, diagnostics samples, and start payload shape.
- Modify: `src/main/services/helper/helperScanPlanner.ts`
  - Keeps helper selection as the explicit gate boundary. Adds specific fallback reasons for registration, lifecycle, and prototype readiness.
- Modify: `test/main/helperScanPlanner.test.ts`
  - Adds gate tests proving production blockers keep helper unavailable and prototype override is narrow.
- Create: `src/main/services/scan/nativeStageHandlers.ts`
  - Owns native-stage-to-job mutation handlers that are currently built inside `DiskScanService`.
- Modify: `src/main/services/diskScanService.ts`
  - Delegates stage handler construction to `nativeStageHandlers.ts` and stops growing scan orchestration responsibilities.
- Create: `test/main/nativeStageHandlers.test.ts`
  - Unit tests for stage handler behavior before extraction.
- Create: `test/main/sharedBoundary.test.ts`
  - Static boundary test preventing `src/shared` from importing Electron, main, renderer, or side-effectful runtime modules.
- Create: `docs/shared-contracts.md`
  - Documents browser-neutral shared modules versus Electron/Node-compatible shared modules.
- Create: `scripts/audit-helper-readiness.ts`
  - Reports helper readiness as structured JSON and remains `blocked` until real identity/FDA evidence exists.
- Modify: `package.json`
  - Adds `audit:helper-readiness`.
- Modify: `docs/project-status-audit.md`
  - Updates LOC, architecture, shared, and test evidence after implementation.

## Task 1: Freeze Helper Gate Decisions

**Files:**
- Modify: `test/main/helperScanPlanner.test.ts`
- Modify: `src/main/services/helper/helperScanPlanner.ts`

- [x] **Step 1: Write failing helper gate tests**

Add these cases to `test/main/helperScanPlanner.test.ts`:

```ts
it("keeps helper blocked when registration preflight is blocked even if lifecycle is present", () => {
  expect(
    resolveHelperScanPlan({
      platform: "darwin",
      stage: "deep",
      options: exactOptions,
      helperStatus: {
        available: false,
        reason: "registration-preflight-blocked:team-id-missing",
        transport: "xpc",
        registrationPreflight: {
          status: "blocked",
          blockers: ["team-id-missing"],
          contract: {
            appBundleIdentifier: "com.example.diskvisualizer",
            helperExecutableBundleRelativePath:
              "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
            helperLabel: "com.example.diskvisualizer.privileged-helper",
            launchDaemonBundleRelativePath:
              "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
            launchDaemonPlistName:
              "com.example.diskvisualizer.privileged-helper.plist",
            serviceManagementModel: "smappservice-daemon",
          },
        },
      },
    }),
  ).toEqual({
    engine: "native",
    reason: "registration-preflight-blocked",
  });
});

it("allows prototype helper only for exact deep darwin scans on xpc transport", () => {
  expect(
    resolveHelperScanPlan({
      platform: "darwin",
      stage: "deep",
      options: exactOptions,
      helperStatus: {
        available: false,
        reason: "helper-prototype",
        transport: "xpc",
      },
      helperPrototypeEnumerate: true,
    }),
  ).toEqual({ engine: "helper" });

  expect(
    resolveHelperScanPlan({
      platform: "darwin",
      stage: "quick",
      options: exactOptions,
      helperStatus: {
        available: false,
        reason: "helper-prototype",
        transport: "xpc",
      },
      helperPrototypeEnumerate: true,
    }),
  ).toEqual({
    engine: "native",
    reason: "quick-stage",
  });
});
```

- [x] **Step 2: Run test to verify RED**

Run:

```bash
pnpm test test/main/helperScanPlanner.test.ts
```

Expected: the first new test fails because `resolveHelperScanPlan` currently returns `helper-unavailable` instead of `registration-preflight-blocked`.

- [x] **Step 3: Implement explicit fallback reason**

Modify `src/main/services/helper/helperScanPlanner.ts`:

```ts
export type HelperFallbackReason =
  | "non-darwin-platform"
  | "quick-stage"
  | "non-exact-scan"
  | "registration-preflight-blocked"
  | "helper-unavailable";
```

Inside the `if (!input.helperStatus.available)` branch, add this check before prototype override:

```ts
    if (input.helperStatus.registrationPreflight?.status === "blocked") {
      return {
        engine: "native",
        reason: "registration-preflight-blocked",
      };
    }
```

Keep the existing prototype override after that check so production blockers remain stronger than prototype enumeration unless a later task explicitly changes the policy.

- [x] **Step 4: Run GREEN**

Run:

```bash
pnpm test test/main/helperScanPlanner.test.ts
```

Expected: all helper planner tests pass.

- [x] **Step 5: Check affected helper tests**

Run:

```bash
pnpm test test/main/helperClient.test.ts test/main/nativeScanOrchestrator.test.ts
```

Expected: both files pass. If existing expectations assert `helper-unavailable`, update them only where the input has `registrationPreflight.status === "blocked"`.

## Task 2: Extract Native Scanner Protocol Parsing

**Files:**
- Create: `test/main/nativeScannerProtocolParser.test.ts`
- Create: `src/main/services/native/nativeScannerProtocol.ts`
- Modify: `src/main/services/native/nativeRustScannerClient.ts`

- [x] **Step 1: Write failing parser tests**

Create `test/main/nativeScannerProtocolParser.test.ts`:

```ts
/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  buildNativeScannerStartPayload,
  parseNativeScannerLine,
  summarizeNativeMessage,
} from "../../src/main/services/native/nativeScannerProtocol";
import type { NativeScannerStartRequest } from "../../src/main/services/native/nativeRustScannerClient";

const baseRequest: NativeScannerStartRequest = {
  scanId: "scan-1",
  root: "/Users/tester",
  mode: "deep",
  platform: "darwin",
  timeBudgetMs: 0,
  maxDepth: 128,
  sameDeviceOnly: true,
  concurrency: 16,
  accuracyMode: "full",
  deepPolicyPreset: "exact",
  elevationPolicy: "manual",
  emitPolicy: {
    aggBatchMaxItems: 64,
    aggBatchMaxMs: 20,
    progressIntervalMs: 80,
  },
  concurrencyPolicy: {
    min: 4,
    max: 16,
    adaptive: true,
  },
  skipBasenames: [],
  softSkipPathRules: [],
  softSkipPrefixes: [],
  skipDirSuffixes: [],
  blockedPrefixes: [],
  permissionPrefixes: [],
};

describe("nativeScannerProtocol", () => {
  it("parses native aggregate batches and clamps invalid counters", () => {
    expect(
      parseNativeScannerLine(JSON.stringify({
        type: "agg_batch",
        items: [
          { path: "/a", sizeDelta: 12.8, countDelta: 1.2, estimated: true },
          { path: "/b", sizeDelta: -5, countDelta: -2, estimated: false },
          { path: "", sizeDelta: 10, countDelta: 1 },
        ],
      })),
    ).toEqual({
      type: "agg_batch",
      items: [
        { path: "/a", sizeDelta: 12, countDelta: 1, estimated: true },
        { path: "/b", sizeDelta: 0, countDelta: 0, estimated: false },
      ],
    });
  });

  it("returns null for malformed or unsupported native lines", () => {
    expect(parseNativeScannerLine("")).toBeNull();
    expect(parseNativeScannerLine("not-json")).toBeNull();
    expect(parseNativeScannerLine(JSON.stringify({ type: "unknown" }))).toBeNull();
  });

  it("preserves diagnostics samples from native messages", () => {
    expect(
      parseNativeScannerLine(JSON.stringify({
        type: "diagnostics",
        filesPerSec: 10.5,
        stageElapsedMs: 42,
        ioWaitRatio: 0.25,
        queueDepth: 7,
        hotPath: "/Users/tester",
        softSkippedByPolicy: 2,
        deferredByBudget: 3,
        policySkipSamples: ["/policy"],
        permissionSamples: ["/permission"],
        scopeSkipSamples: ["/scope"],
        budgetDeferredSamples: ["/budget"],
        inflight: 4,
      })),
    ).toEqual({
      type: "diagnostics",
      filesPerSec: 10.5,
      stageElapsedMs: 42,
      ioWaitRatio: 0.25,
      queueDepth: 7,
      hotPath: "/Users/tester",
      softSkippedByPolicy: 2,
      deferredByBudget: 3,
      policySkipSamples: ["/policy"],
      permissionSamples: ["/permission"],
      scopeSkipSamples: ["/scope"],
      budgetDeferredSamples: ["/budget"],
      inflight: 4,
    });
  });

  it("builds start payloads without process lifecycle fields", () => {
    expect(buildNativeScannerStartPayload(baseRequest)).toMatchObject({
      type: "start",
      scanId: "scan-1",
      root: "/Users/tester",
      mode: "deep",
      permissionPrefixes: [],
    });
  });

  it("summarizes aggregate batches without logging every item", () => {
    expect(
      summarizeNativeMessage({
        type: "agg_batch",
        items: [
          { path: "/a", sizeDelta: 1, countDelta: 1, estimated: false },
          { path: "/b", sizeDelta: 2, countDelta: 1, estimated: false },
        ],
      }),
    ).toEqual({
      type: "agg_batch",
      items: 2,
    });
  });
});
```

- [x] **Step 2: Run parser test to verify RED**

Run:

```bash
pnpm test test/main/nativeScannerProtocolParser.test.ts
```

Expected: module import fails because `nativeScannerProtocol.ts` does not exist.

- [x] **Step 3: Create protocol module**

Create `src/main/services/native/nativeScannerProtocol.ts` and move these from `nativeRustScannerClient.ts`:

```ts
import type {
  NativeScannerMessage,
  NativeScannerStartRequest,
} from "./nativeRustScannerClient";

export function buildNativeScannerStartPayload(
  request: NativeScannerStartRequest,
): Record<string, unknown> {
  return {
    type: "start",
    scanId: request.scanId,
    root: request.root,
    mode: request.mode,
    platform: request.platform,
    timeBudgetMs: request.timeBudgetMs,
    maxDepth: request.maxDepth,
    sameDeviceOnly: request.sameDeviceOnly,
    concurrency: request.concurrency,
    accuracyMode: request.accuracyMode,
    deepPolicyPreset: request.deepPolicyPreset,
    elevationPolicy: request.elevationPolicy,
    emitPolicy: request.emitPolicy,
    concurrencyPolicy: request.concurrencyPolicy,
    skipBasenames: request.skipBasenames,
    softSkipPathRules: request.softSkipPathRules,
    softSkipPrefixes: request.softSkipPrefixes,
    skipDirSuffixes: request.skipDirSuffixes,
    blockedPrefixes: request.blockedPrefixes,
    permissionPrefixes: request.permissionPrefixes,
  };
}

export function summarizeNativeMessage(
  message: NativeScannerMessage,
): Record<string, unknown> {
  if (message.type === "agg_batch") {
    return {
      type: message.type,
      items: message.items.length,
    };
  }

  return { ...message };
}
```

Then move the existing parser helpers into the same file and export:

```ts
export function parseNativeScannerLine(line: string): NativeScannerMessage | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const message = raw as Record<string, unknown>;
  return parseSupportedNativeMessage(message);
}
```

In the same file, implement private helpers named
`parseSupportedNativeMessage`, `toSafeNonNegative`, and
`toOptionalStringArray`. These helpers must contain the parsing logic that is
currently local to `nativeRustScannerClient.ts`; do not change parser behavior
in this extraction task.

`parseSupportedNativeMessage` must support the same message cases currently
supported by `nativeRustScannerClient.ts`: `agg`, `agg_batch`, `progress`,
`coverage`, `diagnostics`, `elevation_required`, `quick_ready`, `warn`, and
`done`. Malformed messages return `null`, counters are clamped to non-negative
integers, and diagnostic sample arrays are preserved.

- [x] **Step 4: Use protocol module from session client**

Modify `src/main/services/native/nativeRustScannerClient.ts`:

```ts
import {
  buildNativeScannerStartPayload,
  parseNativeScannerLine,
  summarizeNativeMessage,
} from "./nativeScannerProtocol";
```

Replace inline `startPayload` creation in `runStage` with:

```ts
      const startPayload = buildNativeScannerStartPayload(request);
```

Remove the moved parser/summarizer helper definitions from `nativeRustScannerClient.ts`.

- [x] **Step 5: Run GREEN**

Run:

```bash
pnpm test test/main/nativeScannerProtocolParser.test.ts test/main/nativeScannerProtocol.test.ts
```

Expected: both parser unit tests and native scanner protocol integration tests pass.

- [x] **Step 6: Check LOC**

Run:

```bash
wc -l src/main/services/native/nativeRustScannerClient.ts src/main/services/native/nativeScannerProtocol.ts
```

Expected: `nativeRustScannerClient.ts` is below 500 LOC and the new protocol file is below 300 LOC.

## Task 3: Extract Native Stage Handlers from DiskScanService

**Files:**
- Create: `test/main/nativeStageHandlers.test.ts`
- Create: `src/main/services/scan/nativeStageHandlers.ts`
- Modify: `src/main/services/diskScanService.ts`

- [x] **Step 1: Write failing native stage handler tests**

Create `test/main/nativeStageHandlers.test.ts`:

```ts
/* @vitest-environment node */

import { describe, expect, it, vi } from "vitest";
import { createNativeStageHandlers } from "../../src/main/services/scan/nativeStageHandlers";
import { ScanAggregator } from "../../src/main/services/scanAggregator";
import type { ScanJob } from "../../src/main/services/scan/scanSessionTypes";

function makeJob(): ScanJob {
  const startedAt = Date.now();
  return {
    scanId: "scan-1",
    rootPath: "/Users/tester",
    startedAt,
    optInProtected: false,
    cancelled: false,
    paused: false,
    completed: false,
    scannedCount: 0,
    totalBytes: 0,
    currentPath: "/Users/tester",
    lastEmitAt: startedAt,
    pendingDeltaMap: new Map(),
    pendingDeltaEventCount: 0,
    blockedByPolicyCount: 0,
    blockedByPermissionCount: 0,
    skippedByScopeCount: 0,
    elevationRequired: false,
    elevationAttempted: false,
    lastCoverageEmitAt: startedAt,
    stageStartedAt: startedAt,
    emittedErrorCount: 0,
    permissionErrorCount: 0,
    ioErrorCount: 0,
    quickReadyEmitted: false,
    estimatedResult: true,
    diagnosticsLastEmitAt: startedAt,
    estimatedDirectories: new Set(),
    skippedHeavyDirectories: new Set(),
    deepSkippedByPolicy: false,
    softSkippedByPolicyCount: 0,
    deferredByBudgetCount: 0,
    skipSamples: {},
    inflightCount: 0,
    rootDeviceId: null,
    deniedPermissionRoots: [],
    pendingPermissionRescanRoots: new Set(),
    completedPermissionRescanRoots: [],
    nonRemovableRoots: [],
    visibleNonRemovableRoots: new Set(),
    options: {
      scanMode: "native_rust",
      performanceProfile: "preview-first",
      accuracyMode: "preview",
      deepPolicyPreset: "responsive",
      quickBudgetMs: 1500,
      deepBudgetMs: 9000,
      allowNodeFallback: true,
      optInProtected: false,
      elevationPolicy: "manual",
      statConcurrency: 16,
      emitPolicy: {
        aggBatchMaxItems: 64,
        aggBatchMaxMs: 20,
        progressIntervalMs: 80,
      },
      concurrencyPolicy: {
        min: 4,
        max: 16,
        adaptive: true,
      },
    },
    engine: "native",
    aggregator: new ScanAggregator("/Users/tester", 200, "darwin"),
    pathClassifier: () => ({ allowed: true }),
    scanStage: "deep",
  };
}

describe("nativeStageHandlers", () => {
  it("records aggregate batches and emits progress through dependencies", () => {
    const job = makeJob();
    const recordFileObservation = vi.fn();
    const recordEstimatedDirectory = vi.fn();
    const emitProgressBatch = vi.fn();
    const handlers = createNativeStageHandlers({
      job,
      stageStartedAt: job.stageStartedAt,
      eventBus: {
        emitCoverageUpdate: vi.fn(),
        emitDiagnostics: vi.fn(),
        emitPerfSample: vi.fn(),
        emitProgressBatch,
        emitQuickReadyEvent: vi.fn(),
      },
      scanPolicyService: {
        emitElevationRequired: vi.fn(),
        emitRecoverableError: vi.fn(),
        recordEstimatedDirectory,
        recordFileObservation,
        syncExactTraversal: vi.fn(),
      },
      emitQuickReadyFromNative: vi.fn(),
      markVisibleNonRemovableRoot: vi.fn(),
      toNativeScannerError: () => new Error("native"),
    });

    handlers.onAggBatch({
      type: "agg_batch",
      items: [
        { path: "/Users/tester/a.txt", sizeDelta: 3, countDelta: 1, estimated: false },
        { path: "/Users/tester/dir", sizeDelta: 9, countDelta: 0, estimated: true },
      ],
    });

    expect(recordFileObservation).toHaveBeenCalledWith(job, "/Users/tester/a.txt", 3);
    expect(recordEstimatedDirectory).toHaveBeenCalledWith(job, "/Users/tester/dir", 9);
    expect(job.currentPath).toBe("/Users/tester/dir");
    expect(emitProgressBatch).toHaveBeenCalledWith(job, "walking", false);
  });

  it("merges coverage and diagnostic counters without lowering existing values", () => {
    const job = makeJob();
    job.blockedByPolicyCount = 5;
    const emitCoverageUpdate = vi.fn();
    const emitPerfSample = vi.fn();
    const handlers = createNativeStageHandlers({
      job,
      stageStartedAt: job.stageStartedAt,
      eventBus: {
        emitCoverageUpdate,
        emitDiagnostics: vi.fn(),
        emitPerfSample,
        emitProgressBatch: vi.fn(),
        emitQuickReadyEvent: vi.fn(),
      },
      scanPolicyService: {
        emitElevationRequired: vi.fn(),
        emitRecoverableError: vi.fn(),
        recordEstimatedDirectory: vi.fn(),
        recordFileObservation: vi.fn(),
        syncExactTraversal: vi.fn(),
      },
      emitQuickReadyFromNative: vi.fn(),
      markVisibleNonRemovableRoot: vi.fn(),
      toNativeScannerError: () => new Error("native"),
    });

    handlers.onCoverage({
      type: "coverage",
      scanned: 10,
      blockedByPolicy: 2,
      blockedByPermission: 4,
      skippedByScope: 1,
      elevationRequired: true,
    });
    handlers.onDiagnostics({
      type: "diagnostics",
      filesPerSec: 10,
      stageElapsedMs: 20,
      ioWaitRatio: 0.1,
      queueDepth: 3,
      policySkipSamples: ["/policy"],
      permissionSamples: ["/permission"],
      inflight: 2,
    });

    expect(job.blockedByPolicyCount).toBe(5);
    expect(job.blockedByPermissionCount).toBe(4);
    expect(job.elevationRequired).toBe(true);
    expect(job.skipSamples.permission).toEqual(["/permission"]);
    expect(job.inflightCount).toBe(2);
    expect(emitCoverageUpdate).toHaveBeenCalledWith(job, true);
    expect(emitPerfSample).toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify RED**

Run:

```bash
pnpm test test/main/nativeStageHandlers.test.ts
```

Expected: module import fails because `nativeStageHandlers.ts` does not exist.

- [x] **Step 3: Extract production handler factory**

Create `src/main/services/scan/nativeStageHandlers.ts` with:

```ts
import type { ScanConfidence } from "../../../types/contracts";
import { buildQuickReadyPayload } from "../diagnostics/scanDiagnostics";
import type {
  NativeStageHandlers,
  NativeWarnMessage,
} from "./nativeScanOrchestrator";
import type { ScanEventBus } from "./scanEventBus";
import type { ScanPolicyService } from "./scanPolicyService";
import type { ScanJob } from "./scanSessionTypes";
```

Export:

```ts
export interface CreateNativeStageHandlersInput {
  job: ScanJob;
  stageStartedAt: number;
  eventBus: Pick<
    ScanEventBus,
    | "emitCoverageUpdate"
    | "emitDiagnostics"
    | "emitPerfSample"
    | "emitProgressBatch"
    | "emitQuickReadyEvent"
  >;
  scanPolicyService: Pick<
    ScanPolicyService,
    | "emitElevationRequired"
    | "emitRecoverableError"
    | "recordEstimatedDirectory"
    | "recordFileObservation"
    | "syncExactTraversal"
  >;
  emitQuickReadyFromNative: (
    job: ScanJob,
    event: { elapsedMs: number; confidence: ScanConfidence; estimated: boolean },
    stageStartedAt: number,
  ) => void;
  markVisibleNonRemovableRoot: (job: ScanJob, targetPath: string) => void;
  toNativeScannerError: (scanId: string, message: NativeWarnMessage) => Error;
}
```

Create `src/main/services/scan/nativeStageHandlers.ts` by moving the current
native stage handler object from `DiskScanService.createNativeStageHandlers`.
Use this exact dependency mapping:

- `this.eventBus` becomes `eventBus`
- `this.scanPolicyService` becomes `scanPolicyService`
- `this.markVisibleNonRemovableRoot(...)` becomes
  `markVisibleNonRemovableRoot(...)`
- `this.emitQuickReadyFromNative(...)` becomes
  `emitQuickReadyFromNative(...)`
- `toNativeScannerError(...)` comes from the input dependency

```ts
export function createNativeStageHandlers(
  input: CreateNativeStageHandlersInput,
): NativeStageHandlers {
  const {
    job,
    stageStartedAt,
    eventBus,
    scanPolicyService,
    emitQuickReadyFromNative,
    markVisibleNonRemovableRoot,
    toNativeScannerError,
  } = input;
  let queueDepth = 0;

  return {
    onAgg: (message) => {
      job.currentPath = message.path;
      markVisibleNonRemovableRoot(job, message.path);
      if (message.countDelta > 0) {
        scanPolicyService.recordFileObservation(job, message.path, message.sizeDelta);
      } else if (message.sizeDelta > 0) {
        scanPolicyService.recordEstimatedDirectory(job, message.path, message.sizeDelta);
      }
      eventBus.emitProgressBatch(job, "walking", false);
    },
  };
}
```

Move `mergeSkipSamples` into this module together with the diagnostics handler,
because it is part of native stage event handling.

The returned handler object must include all handlers currently returned by
`DiskScanService.createNativeStageHandlers`: `onAgg`, `onAggBatch`,
`onProgress`, `onCoverage`, `onDiagnostics`, `onElevationRequired`,
`onHelperPlan`, `onQuickReady`, `onWarn`, and `onDone`.

- [x] **Step 4: Wire DiskScanService to the extracted factory**

Modify `src/main/services/diskScanService.ts`:

```ts
import {
  createNativeStageHandlers as createNativeStageHandlersForJob,
} from "./scan/nativeStageHandlers";
```

Replace the private `createNativeStageHandlers` body with a thin delegator:

```ts
  private createNativeStageHandlers(
    job: ScanJob,
    stageStartedAt: number,
  ): NativeStageHandlers {
    return createNativeStageHandlersForJob({
      job,
      stageStartedAt,
      eventBus: this.eventBus,
      scanPolicyService: this.scanPolicyService,
      emitQuickReadyFromNative: (targetJob, event, startedAt) =>
        this.emitQuickReadyFromNative(targetJob, event, startedAt),
      markVisibleNonRemovableRoot: (targetJob, targetPath) =>
        this.markVisibleNonRemovableRoot(targetJob, targetPath),
      toNativeScannerError,
    });
  }
```

- [x] **Step 5: Run GREEN**

Run:

```bash
pnpm test test/main/nativeStageHandlers.test.ts test/main/diskScanService.test.ts
```

Expected: both pass.

- [x] **Step 6: Check LOC**

Run:

```bash
wc -l src/main/services/diskScanService.ts src/main/services/scan/nativeStageHandlers.ts
```

Expected: `diskScanService.ts` decreases materially. If still above 500 LOC, record it as a temporary exception in `docs/project-status-audit.md` after Task 6.

## Task 4: Add Shared Boundary Check and Contract Documentation

**Files:**
- Create: `test/main/sharedBoundary.test.ts`
- Create: `docs/shared-contracts.md`

- [x] **Step 1: Write failing shared boundary test**

Create `test/main/sharedBoundary.test.ts`:

```ts
/* @vitest-environment node */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenImportPatterns = [
  /from\s+["'][^"']*src\/main[^"']*["']/,
  /from\s+["'][^"']*src\/renderer[^"']*["']/,
  /from\s+["'][^"']*electron[^"']*["']/,
  /from\s+["']electron["']/,
  /from\s+["']node:fs["']/,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:os["']/,
  /process\.env/,
  /ipcMain/,
  /BrowserWindow/,
];

describe("shared boundary", () => {
  it("keeps shared modules free of Electron, main, renderer, and side-effectful runtime imports", () => {
    const sharedFiles = collectSourceFiles(path.join(process.cwd(), "src", "shared"));
    const violations = sharedFiles.flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return forbiddenImportPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path.relative(process.cwd(), filePath)} violates ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});

function collectSourceFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}
```

- [x] **Step 2: Run boundary test**

Run:

```bash
pnpm test test/main/sharedBoundary.test.ts
```

Expected: pass if current shared imports are within allowed bounds. If it fails, fix only the violating shared imports or adjust the allowlist with a documented reason in `docs/shared-contracts.md`.

- [x] **Step 3: Add shared contract documentation**

Create `docs/shared-contracts.md`:

```md
# Shared Contracts

Date: 2026-06-07

## Purpose

`src/shared` is the contract layer between renderer, preload, main, tests, and
native-helper protocol adapters. It must not contain orchestration, UI state,
Electron APIs, helper lifecycle side effects, filesystem probing, or process
environment reads.

## Browser-Neutral Modules

- `src/shared/constants/ipcChannels.ts`
- `src/shared/schemas/common.ts`
- `src/shared/schemas/scan.ts`
- `src/shared/schemas/system.ts`
- `src/shared/schemas/window.ts`
- `src/shared/schemas/helperProtocol.ts`
- `src/shared/domain/scanIntent.ts`

## Electron/Node-Compatible Domain Modules

These modules are shared contracts, but they import `node:path` and are not
strict browser-neutral:

- `src/shared/domain/pathPolicy.ts`
- `src/shared/domain/scanPolicyContract.ts`

They may be used in Electron/Vite code where Node-compatible bundling is
available. Do not use them in a strict browser-only runtime without replacing
`node:path` usage.

## Boundary Rules

- Allowed: zod schemas, literal constants, pure domain normalization, policy
  contract data.
- Disallowed: `electron`, `node:fs`, `node:child_process`, `process.env`,
  renderer hooks, main services, helper lifecycle side effects, IPC handlers.

`test/main/sharedBoundary.test.ts` enforces the highest-risk imports.
```

- [x] **Step 4: Run docs-related tests**

Run:

```bash
pnpm test test/main/sharedBoundary.test.ts test/main/helperProtocol.test.ts test/main/scanPolicyContract.test.ts
```

Expected: all pass.

## Task 5: Add Helper Readiness Audit Command

**Files:**
- Create: `src/main/services/helper/helperReadinessAudit.ts`
- Create: `scripts/audit-helper-readiness.ts`
- Modify: `package.json`
- Create: `test/main/helperReadinessAudit.test.ts`

- [x] **Step 1: Write failing readiness audit test**

Create `test/main/helperReadinessAudit.test.ts`:

```ts
/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { buildHelperReadinessReport } from "../../src/main/services/helper/helperReadinessAudit";

describe("helper readiness audit", () => {
  it("reports blocked while identity and FDA evidence are missing", () => {
    const report = buildHelperReadinessReport({
      registrationPreflight: {
        status: "blocked",
        blockers: [
          "team-id-missing",
          "designated-requirement-missing",
          "fda-validation-matrix-missing",
        ],
        contract: {
          appBundleIdentifier: "com.example.diskvisualizer",
          helperExecutableBundleRelativePath:
            "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
          helperLabel: "com.example.diskvisualizer.privileged-helper",
          launchDaemonBundleRelativePath:
            "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
          launchDaemonPlistName:
            "com.example.diskvisualizer.privileged-helper.plist",
          serviceManagementModel: "smappservice-daemon",
        },
      },
      fdaMatrixStatus: "blocked",
      serviceManagementStatus: "not-installed",
    });

    expect(report.status).toBe("blocked");
    expect(report.canEnableHelperByDefault).toBe(false);
    expect(report.blockers).toContain("team-id-missing");
    expect(report.blockers).toContain("fda-validation-matrix-missing");
  });
});
```

- [x] **Step 2: Run test to verify RED**

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts
```

Expected: import fails because `buildHelperReadinessReport` does not exist.

- [x] **Step 3: Implement readiness report builder**

Create `src/main/services/helper/helperReadinessAudit.ts`:

```ts
import type { HelperRegistrationPreflight } from "./helperRegistration";

export interface HelperReadinessReportInput {
  registrationPreflight: HelperRegistrationPreflight;
  fdaMatrixStatus: "ready" | "blocked";
  serviceManagementStatus: "registered" | "not-installed" | "unknown";
}

export interface HelperReadinessReport {
  status: "ready" | "blocked";
  canEnableHelperByDefault: boolean;
  blockers: string[];
  serviceManagementStatus: HelperReadinessReportInput["serviceManagementStatus"];
}

export function buildHelperReadinessReport(
  input: HelperReadinessReportInput,
): HelperReadinessReport {
  const blockers = new Set<string>(input.registrationPreflight.blockers);
  if (input.fdaMatrixStatus !== "ready") {
    blockers.add("fda-validation-matrix-missing");
  }
  if (input.serviceManagementStatus !== "registered") {
    blockers.add("service-management-not-registered");
  }

  return {
    status: blockers.size === 0 ? "ready" : "blocked",
    canEnableHelperByDefault: false,
    blockers: [...blockers].sort(),
    serviceManagementStatus: input.serviceManagementStatus,
  };
}
```

Keep `canEnableHelperByDefault` false in this phase even if blockers are empty. Default enablement belongs to the later helper implementation phase.

- [x] **Step 4: Add script command**

Create `scripts/audit-helper-readiness.ts`:

```ts
import { buildHelperReadinessReport } from "../src/main/services/helper/helperReadinessAudit";
import { resolveHelperRegistrationPreflightInputFromEnv } from "../src/main/services/helper/helperRegistration";

const registrationPreflight = resolveHelperRegistrationPreflightInputFromEnv();
const report = buildHelperReadinessReport({
  registrationPreflight,
  fdaMatrixStatus: registrationPreflight.blockers.includes("fda-validation-matrix-missing")
    ? "blocked"
    : "ready",
  serviceManagementStatus: "unknown",
});

console.log(JSON.stringify(report, null, 2));

if (report.status !== "ready") {
  process.exitCode = 1;
}
```

Modify `package.json`:

```json
"audit:helper-readiness": "bun run scripts/audit-helper-readiness.ts"
```

- [x] **Step 5: Run GREEN**

Run:

```bash
pnpm test test/main/helperReadinessAudit.test.ts test/main/helperPreflightAudit.test.ts
bun run audit:helper-readiness
```

Expected:

- Tests pass.
- `bun run audit:helper-readiness` exits nonzero while production identity/FDA evidence is missing and prints JSON with `"status": "blocked"`.

## Task 6: Update Audit Evidence and Verify Full Phase Slice

**Files:**
- Modify: `docs/project-status-audit.md`

- [x] **Step 1: Recalculate LOC**

Run:

```bash
find src/main src/renderer/src native/scanner/src native/macos-helper -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.rs' -o -name '*.swift' \) -not -path '*/target/*' -print0 | xargs -0 wc -l | sort -nr | sed -n '1,40p'
```

Record production files still over 500 LOC.

- [x] **Step 2: Run focused verification**

Run:

```bash
pnpm test test/main/helperScanPlanner.test.ts test/main/nativeScannerProtocolParser.test.ts test/main/nativeStageHandlers.test.ts test/main/sharedBoundary.test.ts test/main/helperReadinessAudit.test.ts
```

Expected: all focused tests pass.

- [x] **Step 3: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
cargo test --manifest-path native/scanner/Cargo.toml
```

Expected:

- `pnpm test`: all Vitest tests pass.
- `pnpm typecheck`: exits 0.
- `pnpm lint`: exits 0.
- `cargo test`: tests pass. If Rust warnings remain, record them in `docs/project-status-audit.md` rather than claiming a warning-free state.

- [x] **Step 4: Update `docs/project-status-audit.md`**

Update these sections:

- `Current Local Changes`
- `LOC Review`
- `Architecture Review`
- `Shared Directory Review`
- `Test Reliability Review`
- `Findings`

The update must state:

- Which files remain above 500 LOC.
- Which boundaries were extracted.
- Whether helper remains disabled by default.
- Whether helper readiness audit reports blocked.
- Which verification commands passed.
- Any remaining Rust warnings.

- [x] **Step 5: Final goal audit for this phase slice**

Check the phase design against the implementation:

```bash
rg -n "Phase Exit Criteria|Completion Definition|Required outcomes|Acceptance evidence" docs/superpowers/specs/2026-06-07-pre-helper-architecture-stabilization-design.md
git diff --stat
```

Expected:

- Every implemented item maps to one of the four audit areas.
- No helper default enablement was added.
- No new production file exceeds 300 LOC.
- `DiskScanService` and `nativeRustScannerClient` did not grow.

## Execution Notes

- Do not revert existing uncommitted helper hardening changes.
- Do not revert tracked native scanner target artifacts unless the user explicitly asks.
- Use `pnpm`, `bun`, and `cargo`; do not use npm.
- Run each test first and verify RED before production code changes.
- Keep helper execution disabled by default even if a readiness report can be made `ready` in a synthetic test.
