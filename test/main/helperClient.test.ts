/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  buildHelperEnumerateRequest,
  createDefaultHelperClient,
  DisabledHelperClient,
  HELPER_DISABLED_REASON,
  HelperUnavailableError,
  TransportHelperClient,
} from "../../src/main/services/helper/helperClient";
import { HelperTransportUnavailableError, type HelperTransport } from "../../src/main/services/helper/helperTransport";
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

  it("delegates validated enumerate requests to the configured transport", async () => {
    const receivedRequests: unknown[] = [];
    const transport: HelperTransport = {
      getStatus: async () => ({ available: true, transport: "xpc" }),
      getVersion: async () => "test-helper",
      healthCheck: async () => ({ available: true, transport: "xpc" }),
      enumerate: async (request, handlers) => {
        receivedRequests.push(request);
        handlers.onEvent({
          type: "done",
          requestId: request.requestId,
          elapsedMs: 1,
          estimated: false,
        });
      },
    };
    const events: unknown[] = [];
    const client = new TransportHelperClient(transport);

    await client.enumerate(
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
        issuedAtMs: 1_765_000_000_000,
        nonce: "0123456789abcdef",
        requestId: "request-1",
      },
      { onEvent: (event) => events.push(event) },
    );

    expect(receivedRequests).toHaveLength(1);
    expect(receivedRequests[0]).toMatchObject({
      schemaVersion: 1,
      requestId: "request-1",
      scanId: "scan-1",
      stageId: "deep",
      operation: "scan.enumerate",
      payload: {
        root: "/Users/tester",
        permissionPolicy: "report-only",
      },
    });
    expect(events).toEqual([
      {
        type: "done",
        requestId: "request-1",
        elapsedMs: 1,
        estimated: false,
      },
    ]);
  });

  it("maps unavailable transport errors to helper client errors", async () => {
    const transport: HelperTransport = {
      getStatus: async () => ({ available: false, transport: "disabled" }),
      getVersion: async () => null,
      healthCheck: async () => ({ available: false, transport: "disabled" }),
      enumerate: async () => {
        throw new HelperTransportUnavailableError("xpc-not-registered");
      },
    };
    const client = new TransportHelperClient(transport);

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
    ).rejects.toMatchObject({
      name: "HelperUnavailableError",
      reason: "xpc-not-registered",
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
