/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ScanHistoryStore } from "../../src/main/services/cache/scanHistoryStore";
import { ScanPolicyService } from "../../src/main/services/scan/scanPolicyService";
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
