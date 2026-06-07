/* @vitest-environment node */

import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HelperClient,
  HelperClientStatus,
} from "../../src/main/services/helper/helperClient";
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
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
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

  it("uses helper health check evidence before planning exact deep scans", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    const calls: string[] = [];
    const helperInputs: unknown[] = [];
    const helperClient: HelperClient = {
      getStatus: async () => {
        calls.push("getStatus");
        return { available: false, transport: "xpc" };
      },
      getVersion: async () => "test-helper",
      healthCheck: async () => {
        calls.push("healthCheck");
        return { available: true, transport: "xpc" };
      },
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
      enumerate: async (input, handlers) => {
        helperInputs.push(input);
        handlers.onEvent({
          type: "done",
          requestId: input.requestId ?? "missing-request-id",
          elapsedMs: 1,
          estimated: false,
        });
      },
    };
    const orchestrator = new NativeScanOrchestrator(helperClient);
    const handlers = createRecordingHandlers();

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
    expect(calls).toEqual(["healthCheck"]);
    expect(helperInputs).toHaveLength(1);
    expect(handlers.helperPlans).toEqual([
      {
        engine: "helper",
        transport: "xpc",
      },
    ]);
  });

  it("does not probe helper health for scan stages that cannot use the helper", async () => {
    const cases = [
      {
        name: "quick exact macOS",
        platform: "darwin" as NodeJS.Platform,
        stage: "quick" as const,
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
        name: "preview deep macOS",
        platform: "darwin" as NodeJS.Platform,
        stage: "deep" as const,
        options: resolveScanOptions(
          {
            rootPath: "/Users/tester",
            optInProtected: false,
            accuracyMode: "preview",
          },
          "/Users/tester",
        ),
      },
      {
        name: "exact deep non-macOS",
        platform: "linux" as NodeJS.Platform,
        stage: "deep" as const,
        options: resolveScanOptions(
          {
            rootPath: "/Users/tester",
            optInProtected: false,
            accuracyMode: "full",
          },
          "/Users/tester",
        ),
      },
    ];

    for (const testCase of cases) {
      vi.spyOn(os, "platform").mockReturnValue(testCase.platform);
      const calls: string[] = [];
      const nativeInputs: unknown[] = [];
      const helperClient: HelperClient = {
        getStatus: async () => {
          calls.push("getStatus");
          return { available: true, transport: "xpc" };
        },
        getVersion: async () => "test-helper",
        healthCheck: async () => {
          calls.push("healthCheck");
          return { available: true, transport: "xpc" };
        },
        register: async () => ({ available: false, transport: "xpc" }),
        unregister: async () => ({ available: false, transport: "xpc" }),
        enumerate: async () => {
          throw new Error(`helper should not be selected for ${testCase.name}`);
        },
      };
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
              elapsedMs: 1,
              estimated: false,
            });
          },
        }),
      });

      await orchestrator.runStage(
        {
          scanId: `scan-${testCase.name}`,
          rootPath: "/Users/tester",
          permissionDeniedRoots: [],
          paused: false,
          cancelled: false,
          options: testCase.options,
        },
        {
          mode: testCase.stage,
          maxDepth: 128,
          timeBudgetMs: 0,
        },
        createRecordingHandlers(),
      );

      expect(calls, testCase.name).toEqual(["getStatus"]);
      expect(nativeInputs, testCase.name).toHaveLength(1);
      vi.restoreAllMocks();
    }
  });

  it("falls back to native planning when helper health check fails", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    const calls: string[] = [];
    const nativeInputs: unknown[] = [];
    const helperClient: HelperClient = {
      getStatus: async () => {
        calls.push("getStatus");
        return { available: true, transport: "xpc" };
      },
      getVersion: async () => "test-helper",
      healthCheck: async () => {
        calls.push("healthCheck");
        throw new Error("health failed");
      },
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
      enumerate: async () => {
        throw new Error("helper should not be selected");
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
            elapsedMs: 1,
            estimated: false,
          });
        },
      }),
    });

    await orchestrator.runStage(
      {
        scanId: "scan-health-failed",
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

    expect(calls).toEqual(["healthCheck"]);
    expect(nativeInputs).toHaveLength(1);
    expect(handlers.helperPlans).toEqual([
      {
        engine: "native",
        fallbackReason: "helper-unavailable",
        transport: "disabled",
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
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
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

  it("preserves helper registration blockers in helper plan diagnostics", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    const nativeInputs: unknown[] = [];
    const blockedStatus: HelperClientStatus = {
      available: false,
      reason: "registration-preflight-blocked:team-id-missing",
      transport: "xpc",
      registrationPreflight: {
        status: "blocked",
        blockers: [
          "team-id-missing",
          "helper-xpc-enumerate-bridge-missing",
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
    };
    const helperClient: HelperClient = {
      getStatus: async () => blockedStatus,
      getVersion: async () => "test-helper",
      healthCheck: async () => blockedStatus,
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
      enumerate: async () => {
        throw new Error("helper should not be selected");
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
            elapsedMs: 1,
            estimated: false,
          });
        },
      }),
    });

    await orchestrator.runStage(
      {
        scanId: "scan-helper-blocked",
        rootPath: "/Users/tester",
        permissionDeniedRoots: [],
        paused: false,
        cancelled: false,
        options: resolveScanOptions(
          {
            rootPath: "/Users/tester",
            optInProtected: false,
            accuracyMode: "full",
            deepPolicyPreset: "exact",
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

    expect(nativeInputs).toHaveLength(1);
    expect(handlers.helperPlans).toEqual([
      {
        engine: "native",
        fallbackReason: "registration-preflight-blocked",
        registrationBlockers: [
          "team-id-missing",
          "helper-xpc-enumerate-bridge-missing",
        ],
        transport: "xpc",
      },
    ]);
  });

  it("preserves helper terminal error details in fallback logs", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    const logDir = await fs.mkdtemp(
      path.join(process.cwd(), ".tmp-tests", "helper-error-fallback-log-"),
    );
    process.env.SCAN_LOG_DIR = logDir;
    const helperInputs: unknown[] = [];
    const nativeInputs: unknown[] = [];
    const helperClient: HelperClient = {
      getStatus: async () => ({ available: true, transport: "xpc" }),
      getVersion: async () => "test-helper",
      healthCheck: async () => ({ available: true, transport: "xpc" }),
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
      enumerate: async (input, handlers) => {
        helperInputs.push(input);
        const requestId = input.requestId ?? "missing-request-id";
        handlers.onEvent({
          type: "entry_batch",
          requestId,
          items: [
            {
              path: "/Users/tester/broken.dat",
              parentPath: "/Users/tester",
              kind: "file",
              size: 1,
              estimated: false,
            },
          ],
        });
        handlers.onEvent({
          type: "warn",
          requestId,
          code: "E_HELPER_PERMISSION",
          path: "/Users/tester/Private",
          message: "permission denied",
        });
        handlers.onEvent({
          type: "warn",
          requestId,
          code: "E_TCC_PERMISSION",
          path: "/Users/tester/Library/Messages",
          message: "TCC denied",
        });
        handlers.onEvent({
          type: "warn",
          requestId,
          code: "E_IO",
          path: "/Users/tester/Broken",
          message: "IO failed",
        });
        handlers.onEvent({
          type: "warn",
          requestId,
          code: "E_SCOPE",
          path: "/Users/other",
          message: "scope rejected",
        });
        handlers.onEvent({
          type: "warn",
          requestId,
          code: "E_CANCELLED",
          message: "cancelled",
        });
        handlers.onEvent({
          type: "error",
          requestId,
          code: "E_INVALID_CLIENT",
          message: "Rejected caller identity",
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
      await orchestrator.runStage(
        {
          scanId: "scan-helper-error",
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

      expect(nativeInputs).toHaveLength(1);
      expect(handlers.warns).toEqual([
        {
          type: "warn",
          code: "E_PERMISSION",
          message: "permission denied",
          path: "/Users/tester/Private",
          recoverable: true,
        },
        {
          type: "warn",
          code: "E_PERMISSION",
          message: "TCC denied",
          path: "/Users/tester/Library/Messages",
          recoverable: true,
        },
        {
          type: "warn",
          code: "E_IO",
          message: "IO failed",
          path: "/Users/tester/Broken",
          recoverable: true,
        },
        {
          type: "warn",
          code: "E_SCOPE",
          message: "scope rejected",
          path: "/Users/other",
          recoverable: true,
        },
        {
          type: "warn",
          code: "E_CANCELLED",
          message: "cancelled",
          recoverable: false,
        },
        {
          type: "warn",
          code: "E_INVALID_CLIENT",
          message: "Rejected caller identity",
          recoverable: false,
        },
      ]);
      const logPath = path.join(logDir, "native-scanner.jsonl");
      const entries = (await fs.readFile(logPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const fallback = entries.find(
        (entry) => entry.event === "native_helper_scan_fallback",
      ) as { details?: Record<string, unknown> } | undefined;
      const helperTerminal = entries.find(
        (entry) => entry.event === "native_helper_scan_terminal",
      ) as { details?: Record<string, unknown>; level?: string } | undefined;

      expect(fallback?.details).toMatchObject({
        reason: "helper-error:E_INVALID_CLIENT:Rejected caller identity",
        fallbackEngine: "native",
      });
      expect(helperInputs).toHaveLength(1);
      expect(helperInputs[0]).toMatchObject({
        requestId: expect.any(String),
        traversalPolicyPlanId: "scan-helper-error:deep:exact",
      });
      const helperRequest = helperInputs[0] as {
        requestId: string;
        traversalPolicyPlanId: string;
      };
      expect(helperTerminal?.level).toBe("error");
      expect(helperTerminal?.details).toMatchObject({
        code: "E_INVALID_CLIENT",
        message: "Rejected caller identity",
        operation: "scan.enumerate",
        requestId: helperRequest.requestId,
        rootPath: "/Users/tester",
        terminalStatus: "error",
        traversalPolicyPlanId: helperRequest.traversalPolicyPlanId,
        volumePolicy: "same-device",
        entryCount: 1,
        permissionFailureCount: 1,
        tccFailureCount: 1,
        ioFailureCount: 1,
        scopeRejectionCount: 1,
        cancellationCount: 1,
      });
    } finally {
      await fs.rm(logDir, { recursive: true, force: true });
    }
  });

  it("preserves helper terminal error details when enumerate rejects after emitting error", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    const logDir = await fs.mkdtemp(
      path.join(process.cwd(), ".tmp-tests", "helper-error-reject-fallback-log-"),
    );
    process.env.SCAN_LOG_DIR = logDir;
    const helperClient: HelperClient = {
      getStatus: async () => ({ available: true, transport: "xpc" }),
      getVersion: async () => "test-helper",
      healthCheck: async () => ({ available: true, transport: "xpc" }),
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
      enumerate: async (_input, handlers) => {
        handlers.onEvent({
          type: "error",
          requestId: "request-1",
          code: "E_INVALID_REQUEST",
          message: "Invalid helper request",
        });
        throw new Error("helper-enumerate-failed:exit-1:E_INVALID_REQUEST");
      },
    };
    const orchestrator = new NativeScanOrchestrator(helperClient, {
      createNativeSession: () => ({
        binaryPath: "test-native-scanner",
        dispose: () => undefined,
        pid: 1,
        sendControl: () => undefined,
        waitForExit: async () => undefined,
        runStage: async (_input, nativeHandlers) => {
          nativeHandlers.onMessage({
            type: "done",
            elapsedMs: 3,
            estimated: true,
          });
        },
      }),
    });

    try {
      await orchestrator.runStage(
        {
          scanId: "scan-helper-error-reject",
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
      const fallback = entries.find(
        (entry) => entry.event === "native_helper_scan_fallback",
      ) as { details?: Record<string, unknown> } | undefined;

      expect(fallback?.details).toMatchObject({
        reason: "helper-error:E_INVALID_REQUEST:Invalid helper request",
        fallbackEngine: "native",
      });
    } finally {
      await fs.rm(logDir, { recursive: true, force: true });
    }
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
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
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
    const helperInputs: unknown[] = [];
    const readyStatus: HelperClientStatus = {
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
          helperExecutableBundleRelativePath:
            "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
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
    };
    const helperClient: HelperClient = {
      getStatus: async () => readyStatus,
      getVersion: async () => "test-helper",
      healthCheck: async () => readyStatus,
      register: async () => ({ available: false, transport: "xpc" }),
      unregister: async () => ({ available: false, transport: "xpc" }),
      enumerate: async (input, handlers) => {
        helperInputs.push(input);
        handlers.onEvent({
          type: "ready",
          requestId: input.requestId ?? "missing-request-id",
          helperVersion: "test-helper",
        });
        handlers.onEvent({
          type: "entry_batch",
          requestId: input.requestId ?? "missing-request-id",
          items: [
            {
              path: "/Users/tester/file-a.txt",
              parentPath: "/Users/tester",
              kind: "file",
              size: 10,
              estimated: false,
            },
            {
              path: "/Users/tester/file-b.txt",
              parentPath: "/Users/tester",
              kind: "file",
              size: 20,
              estimated: false,
            },
          ],
        });
        handlers.onEvent({
          type: "coverage",
          requestId: input.requestId ?? "missing-request-id",
          scannedCount: 2,
          permissionFailures: 3,
          ioFailures: 4,
          scopeFailures: 5,
        });
        handlers.onEvent({
          type: "warn",
          requestId: input.requestId ?? "missing-request-id",
          code: "E_TCC_PERMISSION",
          path: "/Users/tester/Library/Messages",
          message: "TCC denied",
        });
        handlers.onEvent({
          type: "warn",
          requestId: input.requestId ?? "missing-request-id",
          code: "E_CANCELLED",
          message: "cancelled",
        });
        handlers.onEvent({
          type: "done",
          requestId: input.requestId ?? "missing-request-id",
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
      const helperStart = entries.find(
        (entry) => entry.event === "native_helper_scan_start",
      ) as { details?: Record<string, unknown> } | undefined;
      const helperReady = entries.find(
        (entry) => entry.event === "native_helper_scan_ready",
      ) as { details?: Record<string, unknown> } | undefined;
      const helperTerminal = entries.find(
        (entry) => entry.event === "native_helper_scan_terminal",
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
            helperExecutableBundleRelativePath:
              "Contents/Library/LaunchServices/com.example.diskvisualizer.privileged-helper",
            launchDaemonPlistName:
              "com.example.diskvisualizer.privileged-helper.plist",
            serviceManagementModel: "smappservice-daemon",
          },
        },
      });
      expect(helperInputs).toHaveLength(1);
      expect(helperInputs[0]).toMatchObject({
        requestId: expect.any(String),
        traversalPolicyPlanId: "scan-log-1:deep:exact",
      });
      const helperRequest = helperInputs[0] as {
        requestId: string;
        traversalPolicyPlanId: string;
      };
      expect(helperRequest.requestId.length).toBeGreaterThan(0);
      expect(helperStart?.details).toMatchObject({
        operation: "scan.enumerate",
        requestId: helperRequest.requestId,
        traversalPolicyPlanId: helperRequest.traversalPolicyPlanId,
      });
      expect(helperReady?.details).toMatchObject({
        helperVersion: "test-helper",
        operation: "scan.enumerate",
        plannedRoots: ["/Users/tester"],
        requestId: helperRequest.requestId,
        rootPath: "/Users/tester",
        traversalPolicyPlanId: helperRequest.traversalPolicyPlanId,
        volumePolicy: "same-device",
      });
      expect(helperTerminal?.details).toMatchObject({
        elapsedMs: 1,
        operation: "scan.enumerate",
        requestId: helperRequest.requestId,
        rootPath: "/Users/tester",
        terminalStatus: "done",
        traversalPolicyPlanId: helperRequest.traversalPolicyPlanId,
        volumePolicy: "same-device",
        entryCount: 2,
        permissionFailureCount: 3,
        tccFailureCount: 1,
        ioFailureCount: 4,
        scopeRejectionCount: 5,
        cancellationCount: 1,
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
  warns: Parameters<NativeStageHandlers["onWarn"]>[0][];
} {
  const aggBatches: Parameters<NativeStageHandlers["onAggBatch"]>[0][] = [];
  const done: Parameters<NativeStageHandlers["onDone"]>[0][] = [];
  const helperPlans: NonNullable<NativeStageHandlers["onHelperPlan"]> extends (
    message: infer T,
  ) => void
    ? T[]
    : never = [];
  const progress: Parameters<NativeStageHandlers["onProgress"]>[0][] = [];
  const warns: Parameters<NativeStageHandlers["onWarn"]>[0][] = [];

  return {
    aggBatches,
    done,
    helperPlans,
    progress,
    warns,
    onAgg: () => undefined,
    onAggBatch: (message) => aggBatches.push(message),
    onCoverage: () => undefined,
    onDiagnostics: () => undefined,
    onDone: (message) => done.push(message),
    onElevationRequired: () => undefined,
    onHelperPlan: (message) => helperPlans.push(message),
    onProgress: (message) => progress.push(message),
    onQuickReady: () => undefined,
    onWarn: (message) => warns.push(message),
  };
}
