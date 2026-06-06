/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  buildHelperEnumerateRequest,
  createDefaultHelperClient,
  DisabledHelperClient,
  HELPER_DISABLED_REASON,
  HelperUnavailableError,
} from "../../src/main/services/helper/helperClient";
import { resolveNativeVolumePlan } from "../../src/main/services/scan/nativeScanOrchestrator";
import { resolveScanOptions } from "../../src/main/services/scan/scanRuntimeOptions";

describe("helperClient", () => {
  it("keeps the default helper client disabled until Phase B gates are resolved", async () => {
    const client = createDefaultHelperClient();

    await expect(client.getStatus()).resolves.toEqual({
      available: false,
      reason: HELPER_DISABLED_REASON,
      transport: "disabled",
    });
    await expect(client.getVersion()).resolves.toBeNull();
    await expect(client.healthCheck()).resolves.toEqual({
      available: false,
      reason: HELPER_DISABLED_REASON,
      transport: "disabled",
    });
  });

  it("fails helper enumeration explicitly instead of silently falling through", async () => {
    const client = new DisabledHelperClient("not-installed");

    await expect(
      client.enumerate(
        {
          rootPath: "/Users/tester",
          scanId: "scan-1",
          stageId: "deep",
          scanMode: "deep",
          options: resolveScanOptions(
            {
              rootPath: "/Users/tester",
              optInProtected: false,
              accuracyMode: "full",
            },
            "/Users/tester",
          ),
          volumePlan: resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin"),
          maxDepth: 128,
        },
        { onEvent: () => undefined },
      ),
    ).rejects.toBeInstanceOf(HelperUnavailableError);
  });

  it("builds a validated helper enumerate request from main-process scan inputs", () => {
    const options = resolveScanOptions(
      {
        rootPath: "/Users/tester",
        optInProtected: false,
        accuracyMode: "full",
      },
      "/Users/tester",
    );

    const request = buildHelperEnumerateRequest({
      rootPath: "/Users/tester",
      scanId: "scan-1",
      stageId: "deep",
      scanMode: "deep",
      options,
      volumePlan: resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin"),
      maxDepth: 128,
      issuedAtMs: 1_765_000_000_000,
      nonce: "0123456789abcdef",
      requestId: "request-1",
      traversalPolicyPlanId: "policy-plan-1",
    });

    expect(request).toMatchObject({
      schemaVersion: 1,
      requestId: "request-1",
      scanId: "scan-1",
      stageId: "deep",
      operation: "scan.enumerate",
      issuedAtMs: 1_765_000_000_000,
      nonce: "0123456789abcdef",
      payload: {
        root: "/Users/tester",
        scanMode: "deep",
        accuracyMode: "full",
        volumePolicy: "same-device",
        plannedRoots: ["/Users/tester"],
        maxDepth: 128,
        sameDeviceOnly: true,
        permissionPolicy: "report-only",
        traversalPolicyPlanId: "policy-plan-1",
        emitPolicy: {
          batchMaxItems: options.emitPolicy.aggBatchMaxItems,
          progressIntervalMs: options.emitPolicy.progressIntervalMs,
        },
      },
    });
  });

  it("rejects helper requests whose root is outside the resolved volume plan", () => {
    const options = resolveScanOptions(
      {
        rootPath: "/Users/tester",
        optInProtected: false,
        accuracyMode: "full",
      },
      "/Users/tester",
    );

    expect(() =>
      buildHelperEnumerateRequest({
        rootPath: "/Library",
        scanId: "scan-1",
        stageId: "deep",
        scanMode: "deep",
        options,
        volumePlan: resolveNativeVolumePlan({ rootPath: "/Users/tester" }, "darwin"),
        maxDepth: 128,
        issuedAtMs: 1_765_000_000_000,
        nonce: "0123456789abcdef",
        requestId: "request-1",
      }),
    ).toThrow();
  });
});
