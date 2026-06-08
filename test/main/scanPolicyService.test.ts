/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ScanHistoryStore } from "../../src/main/services/cache/scanHistoryStore";
import { ScanPolicyService } from "../../src/main/services/scan/scanPolicyService";
import { ScanAggregator } from "../../src/main/services/scanAggregator";
import type { ScanJob } from "../../src/main/services/scan/scanSessionTypes";

const { requestElevationMock } = vi.hoisted(() => ({
  requestElevationMock: vi.fn(),
}));

vi.mock("../../src/main/services/security/macosPrivilegeHelper", () => ({
  requestElevation: requestElevationMock,
}));

describe("ScanPolicyService", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    requestElevationMock.mockReset();
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("refreshes path access after automatic elevation is granted", async () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "darwin",
    });
    requestElevationMock.mockResolvedValue({ granted: true });
    const refreshPathAccess = vi.fn().mockResolvedValue(undefined);
    const eventBus = {
      emitCoverageUpdate: vi.fn(),
      emitElevationRequired: vi.fn(),
    };
    const service = new ScanPolicyService({
      emitError: vi.fn(),
      eventBus,
      maxRecoverableErrors: 100,
      refreshPathAccess,
      scanHistoryStore: new ScanHistoryStore(),
    } as unknown as ConstructorParameters<typeof ScanPolicyService>[0]);
    const job = {
      cancelled: false,
      elevationAttempted: false,
      optInProtected: false,
      options: {
        elevationPolicy: "auto",
      },
    } as unknown as ScanJob;

    service.emitElevationRequired(
      job,
      "/Users/tester/Documents",
      "Path requires permission",
    );

    await waitFor(() => refreshPathAccess.mock.calls.length > 0);

    expect(eventBus.emitElevationRequired).toHaveBeenCalledWith(
      job,
      "/Users/tester/Documents",
      "Path requires permission",
    );
    expect(requestElevationMock).toHaveBeenCalledWith("/Users/tester/Documents");
    expect(job.elevationAttempted).toBe(true);
    expect(job.optInProtected).toBe(true);
    expect(refreshPathAccess).toHaveBeenCalledWith(job);
  });

  it("adds estimated folder sizes to the scan total", () => {
    const appendDeltas = vi.fn();
    const service = new ScanPolicyService({
      emitError: vi.fn(),
      eventBus: {
        appendDeltas,
        emitCoverageUpdate: vi.fn(),
      },
      maxRecoverableErrors: 100,
      scanHistoryStore: new ScanHistoryStore(),
    } as unknown as ConstructorParameters<typeof ScanPolicyService>[0]);
    const job = {
      aggregator: new ScanAggregator("/Users/tester", 200, "darwin"),
      estimatedDirectories: new Set<string>(),
      rootPath: "/Users/tester",
      totalBytes: 0,
    } as unknown as ScanJob;

    service.recordEstimatedDirectory(
      job,
      "/Users/tester/Library/Caches",
      5 * 1024 ** 3,
    );

    expect(job.totalBytes).toBe(5 * 1024 ** 3);
    expect(job.estimatedDirectories.has("/Users/tester/Library/Caches")).toBe(true);
    expect(appendDeltas).toHaveBeenCalled();

    service.recordFileObservation(
      job,
      "/Users/tester/Library/Caches/file.bin",
      256,
    );

    expect(job.totalBytes).toBe(256);
    expect(job.estimatedDirectories.has("/Users/tester/Library/Caches")).toBe(false);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
