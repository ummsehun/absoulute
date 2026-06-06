/* @vitest-environment node */

import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HelperClient } from "../../src/main/services/helper/helperClient";
import {
  NativeScanOrchestrator,
  SCAN_HELPER_PROTOTYPE_ENUMERATE_ENV,
  type NativeStageHandlers,
  resolveNativeHelperScanPlan,
  resolveNativeSameDeviceOnly,
  resolveNativeVolumePlan,
} from "../../src/main/services/scan/nativeScanOrchestrator";
import { resolveScanOptions } from "../../src/main/services/scan/scanRuntimeOptions";

describe("nativeScanOrchestrator", () => {
  const originalScanLogDir = process.env.SCAN_LOG_DIR;
  const originalHelperPrototypeEnumerate =
    process.env[SCAN_HELPER_PROTOTYPE_ENUMERATE_ENV];

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalScanLogDir === undefined) {
      delete process.env.SCAN_LOG_DIR;
    } else {
      process.env.SCAN_LOG_DIR = originalScanLogDir;
    }
    if (originalHelperPrototypeEnumerate === undefined) {
      delete process.env[SCAN_HELPER_PROTOTYPE_ENUMERATE_ENV];
    } else {
      process.env[SCAN_HELPER_PROTOTYPE_ENUMERATE_ENV] =
        originalHelperPrototypeEnumerate;
    }
  });

  it("allows filesystem-root scans to cross mounted system volumes", () => {
    expect(resolveNativeSameDeviceOnly({ rootPath: "/" })).toBe(false);
  });

  it("keeps normal directory scans scoped to the same device", () => {
    expect(resolveNativeSameDeviceOnly({ rootPath: "/Users/tester" })).toBe(true);
  });

  it("plans filesystem root scans as explicit root cross-device scans", () => {
    expect(resolveNativeVolumePlan({ rootPath: "/" }, "darwin")).toMatchObject({
      rootKind: "filesystem-root",
      volumePolicy: "root-cross-device",
      sameDeviceOnly: false,
      plannedRoots: ["/"],
    });
  });

  it("plans data volume scans as explicit volume scans", () => {
    expect(
      resolveNativeVolumePlan({ rootPath: "/System/Volumes/Data" }, "darwin"),
    ).toMatchObject({
      rootKind: "data-volume",
      volumePolicy: "explicit-volumes",
      sameDeviceOnly: true,
      plannedRoots: ["/System/Volumes/Data"],
    });
  });

  it("plans external volume scans as explicit volume scans", () => {
    expect(resolveNativeVolumePlan({ rootPath: "/Volumes/Archive" }, "darwin")).toMatchObject({
      rootKind: "external-volume",
      volumePolicy: "explicit-volumes",
      sameDeviceOnly: true,
      plannedRoots: ["/Volumes/Archive"],
    });
  });

  it("plans normal directory scans as same-device scans", () => {
    expect(resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin")).toMatchObject({
      rootKind: "directory",
      volumePolicy: "same-device",
      sameDeviceOnly: true,
      plannedRoots: ["/Users/tester"],
    });
  });

  it("plans helper only when exact deep scans have an available helper", () => {
    expect(
      resolveNativeHelperScanPlan({
        platform: "darwin",
        stage: "deep",
        options: {
          accuracyMode: "full",
          deepPolicyPreset: "exact",
        },
        helperStatus: {
          available: true,
          transport: "xpc",
        },
      }),
    ).toEqual({ engine: "helper" });
  });

  it("plans native fallback when the helper is unavailable", () => {
    expect(
      resolveNativeHelperScanPlan({
        platform: "darwin",
        stage: "deep",
        options: {
          accuracyMode: "full",
          deepPolicyPreset: "exact",
        },
        helperStatus: {
          available: false,
          reason: "helper-phase-gate-unresolved",
          transport: "disabled",
        },
      }),
    ).toEqual({
      engine: "native",
      reason: "helper-unavailable",
    });
  });

  it("plans prototype helper enumeration on explicit opt-in even before helper readiness", () => {
    expect(
      resolveNativeHelperScanPlan({
        platform: "darwin",
        stage: "deep",
        options: {
          accuracyMode: "full",
          deepPolicyPreset: "exact",
        },
        helperStatus: {
          available: false,
          reason: "xpc-transport-not-implemented",
          transport: "xpc",
        },
        helperPrototypeEnumerate: true,
      }),
    ).toEqual({ engine: "helper" });
  });

  it("routes available helper events through native stage handlers", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    const helperInputs: unknown[] = [];
    const helperClient: HelperClient = {
      getStatus: async () => ({ available: true, transport: "xpc" }),
      getVersion: async () => "test-helper",
      healthCheck: async () => ({ available: true, transport: "xpc" }),
      enumerate: async (input, handlers) => {
        helperInputs.push(input);
        handlers.onEvent({
          type: "entry_batch",
          requestId: "request-1",
          items: [
            {
              path: "/Users/tester/file.txt",
              parentPath: "/Users/tester",
              kind: "file",
              size: 64,
              estimated: false,
            },
          ],
        });
        handlers.onEvent({
          type: "progress",
          requestId: "request-1",
          scannedCount: 1,
          currentPath: "/Users/tester/file.txt",
        });
        handlers.onEvent({
          type: "done",
          requestId: "request-1",
          elapsedMs: 12,
          estimated: false,
        });
      },
    };
    const handlers = createRecordingHandlers();
    const orchestrator = new NativeScanOrchestrator(helperClient);

    const result = await orchestrator.runStage(
      {
        scanId: "scan-1",
        rootPath: "/Users/tester",
        permissionDeniedRoots: [],
        paused: false,
        cancelled: false,
        options: resolveScanOptions(
          {
            rootPath: "/Users/tester",
            optInProtected: false,
            accuracyMode: "full",
          },
          "/Users/tester",
        ),
      },
      {
        mode: "deep",
        maxDepth: 128,
        timeBudgetMs: 0,
      },
      handlers,
    );

    expect(result).toEqual({ estimated: false });
    expect(helperInputs).toHaveLength(1);
    expect(helperInputs[0]).toMatchObject({
      rootPath: "/Users/tester",
      scanId: "scan-1",
      stageId: "deep",
      scanMode: "deep",
      maxDepth: 128,
      volumePlan: {
        volumePolicy: "same-device",
        plannedRoots: ["/Users/tester"],
      },
    });
    expect(handlers.aggBatches).toEqual([
      {
        type: "agg_batch",
        items: [
          {
            path: "/Users/tester/file.txt",
            sizeDelta: 64,
            countDelta: 1,
            estimated: false,
          },
        ],
      },
    ]);
    expect(handlers.progress).toEqual([
      {
        type: "progress",
        scannedCount: 1,
        queuedDirs: 0,
        elapsedMs: 0,
        currentPath: "/Users/tester/file.txt",
      },
    ]);
    expect(handlers.done).toEqual([
      {
        type: "done",
        elapsedMs: 12,
        estimated: false,
      },
    ]);
    expect(handlers.helperPlans).toEqual([
      {
        engine: "helper",
        transport: "xpc",
      },
    ]);
  });

  it("falls back to native scanning when the selected helper enumerate stage fails", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    const helperInputs: unknown[] = [];
    const nativeInputs: unknown[] = [];
    const helperClient: HelperClient = {
      getStatus: async () => ({ available: true, transport: "xpc" }),
      getVersion: async () => "test-helper",
      healthCheck: async () => ({ available: true, transport: "xpc" }),
      enumerate: async (input) => {
        helperInputs.push(input);
        throw new Error("helper-enumerate-failed:exit-1:test-failure");
      },
    };
    const handlers = createRecordingHandlers();
    const orchestrator = new NativeScanOrchestrator(helperClient, {
      createNativeSession: () => ({
        binaryPath: "test-native-scanner",
        dispose: () => undefined,
        pid: 1,
        sendControl: () => undefined,
        waitForExit: async () => undefined,
        runStage: async (input, nativeHandlers) => {
          nativeInputs.push(input);
          nativeHandlers.onMessage({
            type: "done",
            elapsedMs: 3,
            estimated: true,
          });
        },
      }),
    });

    const result = await orchestrator.runStage(
      {
        scanId: "scan-1",
        rootPath: "/Users/tester",
        permissionDeniedRoots: [],
        paused: false,
        cancelled: false,
        options: resolveScanOptions(
          {
            rootPath: "/Users/tester",
            optInProtected: false,
            accuracyMode: "full",
          },
          "/Users/tester",
        ),
      },
      {
        mode: "deep",
        maxDepth: 128,
        timeBudgetMs: 0,
      },
      handlers,
    );

    expect(result).toEqual({ estimated: true });
    expect(helperInputs).toHaveLength(1);
    expect(nativeInputs).toHaveLength(1);
    expect(nativeInputs[0]).toMatchObject({
      scanId: "scan-1",
      root: "/Users/tester",
      mode: "deep",
      maxDepth: 128,
    });
    expect(handlers.done).toEqual([
      {
        type: "done",
        elapsedMs: 3,
        estimated: true,
      },
    ]);
  });

  it("uses prototype helper enumeration from env without marking helper status ready", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    process.env[SCAN_HELPER_PROTOTYPE_ENUMERATE_ENV] = "1";
    const logDir = await fs.mkdtemp(
      path.join(process.cwd(), ".tmp-tests", "helper-prototype-log-"),
    );
    process.env.SCAN_LOG_DIR = logDir;
    const helperInputs: unknown[] = [];
    const nativeInputs: unknown[] = [];
    const helperClient: HelperClient = {
      getStatus: async () => ({
        available: false,
        reason: "xpc-transport-not-implemented",
        transport: "xpc",
      }),
      getVersion: async () => "test-helper",
      healthCheck: async () => ({ available: false, transport: "xpc" }),
      enumerate: async (input, handlers) => {
        helperInputs.push(input);
        handlers.onEvent({
          type: "done",
          requestId: "request-1",
          elapsedMs: 2,
          estimated: false,
        });
      },
    };
    const handlers = createRecordingHandlers();
    const orchestrator = new NativeScanOrchestrator(helperClient, {
      createNativeSession: () => ({
        binaryPath: "test-native-scanner",
        dispose: () => undefined,
        pid: 1,
        sendControl: () => undefined,
        waitForExit: async () => undefined,
        runStage: async (input, nativeHandlers) => {
          nativeInputs.push(input);
          nativeHandlers.onMessage({
            type: "done",
            elapsedMs: 3,
            estimated: true,
          });
        },
      }),
    });

    try {
      const result = await orchestrator.runStage(
        {
          scanId: "scan-1",
          rootPath: "/Users/tester",
          permissionDeniedRoots: [],
          paused: false,
          cancelled: false,
          options: resolveScanOptions(
            {
              rootPath: "/Users/tester",
              optInProtected: false,
              accuracyMode: "full",
            },
            "/Users/tester",
          ),
        },
        {
          mode: "deep",
          maxDepth: 128,
          timeBudgetMs: 0,
        },
        handlers,
      );

      expect(result).toEqual({ estimated: false });
      expect(helperInputs).toHaveLength(1);
      expect(nativeInputs).toHaveLength(0);
      expect(handlers.helperPlans).toEqual([
        {
          engine: "helper",
          prototypeEnumerate: true,
          transport: "xpc",
        },
      ]);

      const logPath = path.join(logDir, "native-scanner.jsonl");
      const entries = (await fs.readFile(logPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const helperPlan = entries.find(
        (entry) => entry.event === "native_helper_scan_plan",
      ) as { details?: Record<string, unknown> } | undefined;

      expect(helperPlan?.details).toMatchObject({
        engine: "helper",
        helperAvailable: false,
        helperPrototypeEnumerate: true,
        helperTransport: "xpc",
      });
    } finally {
      await fs.rm(logDir, { recursive: true, force: true });
    }
  });

  it("logs helper lifecycle details in native helper scan planning", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    const logDir = await fs.mkdtemp(
      path.join(process.cwd(), ".tmp-tests", "helper-plan-log-"),
    );
    process.env.SCAN_LOG_DIR = logDir;
    const helperClient: HelperClient = {
      getStatus: async () => ({
        available: true,
        lifecycle: {
          state: "ready",
          reason: "ready",
          checks: {
            "service-management": "pass",
            "helper-install": "pass",
            "caller-identity": "pass",
            "full-disk-access": "unknown",
            "xpc-channel": "pass",
          },
        },
        registrationPreflight: {
          contract: {
            appBundleIdentifier: "com.example.diskvisualizer",
            helperLabel: "com.example.diskvisualizer.privileged-helper",
            launchDaemonPlistName:
              "com.example.diskvisualizer.privileged-helper.plist",
            launchDaemonBundleRelativePath:
              "Contents/Library/LaunchDaemons/com.example.diskvisualizer.privileged-helper.plist",
            serviceManagementModel: "smappservice-daemon",
          },
          status: "ready",
          blockers: [],
        },
        transport: "xpc",
      }),
      getVersion: async () => "test-helper",
      healthCheck: async () => ({ available: true, transport: "xpc" }),
      enumerate: async (_input, handlers) => {
        handlers.onEvent({
          type: "done",
          requestId: "request-1",
          elapsedMs: 1,
          estimated: false,
        });
      },
    };

    try {
      await new NativeScanOrchestrator(helperClient).runStage(
        {
          scanId: "scan-log-1",
          rootPath: "/Users/tester",
          permissionDeniedRoots: [],
          paused: false,
          cancelled: false,
          options: resolveScanOptions(
            {
              rootPath: "/Users/tester",
              optInProtected: false,
              accuracyMode: "full",
            },
            "/Users/tester",
          ),
        },
        {
          mode: "deep",
          maxDepth: 128,
          timeBudgetMs: 0,
        },
        createRecordingHandlers(),
      );

      const logPath = path.join(logDir, "native-scanner.jsonl");
      const entries = (await fs.readFile(logPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const helperPlan = entries.find(
        (entry) => entry.event === "native_helper_scan_plan",
      ) as { details?: Record<string, unknown> } | undefined;

      expect(helperPlan?.details).toMatchObject({
        engine: "helper",
        helperLifecycle: {
          state: "ready",
          reason: "ready",
          checks: {
            "service-management": "pass",
            "helper-install": "pass",
            "caller-identity": "pass",
            "full-disk-access": "unknown",
            "xpc-channel": "pass",
          },
        },
        helperRegistrationPreflight: {
          status: "ready",
          blockers: [],
          contract: {
            helperLabel: "com.example.diskvisualizer.privileged-helper",
            launchDaemonPlistName:
              "com.example.diskvisualizer.privileged-helper.plist",
            serviceManagementModel: "smappservice-daemon",
          },
        },
      });
    } finally {
      await fs.rm(logDir, { recursive: true, force: true });
    }
  });
});

function createRecordingHandlers(): NativeStageHandlers & {
  aggBatches: Parameters<NativeStageHandlers["onAggBatch"]>[0][];
  done: Parameters<NativeStageHandlers["onDone"]>[0][];
  helperPlans: NonNullable<NativeStageHandlers["onHelperPlan"]> extends (
    message: infer T,
  ) => void
    ? T[]
    : never;
  progress: Parameters<NativeStageHandlers["onProgress"]>[0][];
} {
  const aggBatches: Parameters<NativeStageHandlers["onAggBatch"]>[0][] = [];
  const done: Parameters<NativeStageHandlers["onDone"]>[0][] = [];
  const helperPlans: NonNullable<NativeStageHandlers["onHelperPlan"]> extends (
    message: infer T,
  ) => void
    ? T[]
    : never = [];
  const progress: Parameters<NativeStageHandlers["onProgress"]>[0][] = [];

  return {
    aggBatches,
    done,
    helperPlans,
    progress,
    onAgg: () => undefined,
    onAggBatch: (message) => aggBatches.push(message),
    onCoverage: () => undefined,
    onDiagnostics: () => undefined,
    onDone: (message) => done.push(message),
    onElevationRequired: () => undefined,
    onHelperPlan: (message) => helperPlans.push(message),
    onProgress: (message) => progress.push(message),
    onQuickReady: () => undefined,
    onWarn: () => undefined,
  };
}
