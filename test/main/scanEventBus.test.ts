import { describe, expect, it } from "vitest";
import { ScanEventBus, type ScanEventJob } from "../../src/main/services/scan/scanEventBus";

describe("ScanEventBus", () => {
  it("emits partial completeness when permission and scope gaps exist", () => {
    const eventBus = new ScanEventBus();
    const coverageEvents: Array<{
      completeness: string;
      blockedByPermission: number;
      skippedByScope: number;
      nonRemovableVisible: number;
    }> = [];
    const terminalEvents: string[] = [];

    eventBus.onCoverage((event) => {
      coverageEvents.push({
        completeness: event.coverage.completeness,
        blockedByPermission: event.coverage.blockedByPermission,
        skippedByScope: event.coverage.skippedByScope,
        nonRemovableVisible: event.coverage.nonRemovableVisible,
      });
    });
    eventBus.onTerminal((event) => {
      terminalEvents.push(event.completeness);
    });

    const job: ScanEventJob = {
      aggregator: {
        consumePatch: () => null,
      },
      blockedByPermissionCount: 2,
      blockedByPolicyCount: 1,
      skippedByScopeCount: 3,
      currentPath: "/",
      deferredByBudgetCount: 0,
      diagnosticsLastEmitAt: 0,
      elevationRequired: true,
      emittedErrorCount: 0,
      engine: "native",
      estimatedDirectories: new Set(),
      estimatedResult: false,
      inflightCount: 0,
      ioErrorCount: 0,
      lastCoverageEmitAt: 0,
      lastEmitAt: 0,
      options: {
        elevationPolicy: "manual",
        emitPolicy: {
          progressIntervalMs: 120,
        },
      },
      pendingDeltaEventCount: 0,
      pendingDeltaMap: new Map(),
      permissionErrorCount: 2,
      quickReadyEmitted: true,
      rootPath: "/",
      scanId: "scan-1",
      scannedCount: 42,
      scanStage: "deep",
      softSkippedByPolicyCount: 0,
      skipSamples: {},
      stageStartedAt: 0,
      startedAt: 0,
      totalBytes: 1024,
      visibleNonRemovableRoots: new Set(["/System", "/usr/bin"]),
    };

    eventBus.emitCoverageUpdate(job, true);
    eventBus.emitTerminalEvent(job, "done");

    expect(coverageEvents).toEqual([
      {
        completeness: "partial_mixed",
        blockedByPermission: 2,
        skippedByScope: 3,
        nonRemovableVisible: 2,
      },
    ]);
    expect(terminalEvents).toEqual(["partial_mixed"]);
  });

  it("includes skip cause samples in perf samples", () => {
    const eventBus = new ScanEventBus();
    const perfSamples: Array<{
      skipSamples?: {
        policy?: string[];
        permission?: string[];
        scope?: string[];
        budgetDeferred?: string[];
      };
    }> = [];

    eventBus.onPerfSample((event) => {
      perfSamples.push(event);
    });

    const job = {
      aggregator: {
        consumePatch: () => null,
      },
      blockedByPermissionCount: 1,
      blockedByPolicyCount: 2,
      skippedByScopeCount: 1,
      currentPath: "/",
      deferredByBudgetCount: 1,
      diagnosticsLastEmitAt: 0,
      elevationRequired: true,
      emittedErrorCount: 0,
      engine: "native",
      estimatedDirectories: new Set(),
      estimatedResult: false,
      inflightCount: 0,
      ioErrorCount: 0,
      lastCoverageEmitAt: 0,
      lastEmitAt: 0,
      options: {
        elevationPolicy: "manual",
        emitPolicy: {
          progressIntervalMs: 120,
        },
      },
      pendingDeltaEventCount: 0,
      pendingDeltaMap: new Map(),
      permissionErrorCount: 1,
      quickReadyEmitted: true,
      rootPath: "/",
      scanId: "scan-1",
      scannedCount: 42,
      scanStage: "deep",
      softSkippedByPolicyCount: 2,
      stageStartedAt: 0,
      startedAt: 0,
      totalBytes: 1024,
      visibleNonRemovableRoots: new Set(),
      skipSamples: {
        policy: ["/Users/user/Library/Caches"],
        permission: ["/Users/user/Library/Mail"],
        scope: ["/Volumes/External"],
        budgetDeferred: ["/Users/user/Library/Application Support"],
      },
    } as ScanEventJob & {
      skipSamples: {
        policy: string[];
        permission: string[];
        scope: string[];
        budgetDeferred: string[];
      };
    };

    eventBus.emitPerfSample(job, {
      filesPerSec: 10,
      stageElapsedMs: 120,
      ioWaitRatio: 0.1,
      queueDepth: 2,
    });

    expect(perfSamples.at(-1)?.skipSamples).toEqual({
      policy: ["/Users/user/Library/Caches"],
      permission: ["/Users/user/Library/Mail"],
      scope: ["/Volumes/External"],
      budgetDeferred: ["/Users/user/Library/Application Support"],
    });
  });
});
