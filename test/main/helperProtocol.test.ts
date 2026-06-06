/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  HelperEventSchema,
  HelperRequestEnvelopeSchema,
  HelperScanEnumeratePayloadSchema,
} from "../../src/shared/schemas/helperProtocol";

const validPayload = {
  root: "/Users/tester",
  scanMode: "deep",
  accuracyMode: "full",
  volumePolicy: "same-device",
  plannedRoots: ["/Users/tester"],
  maxDepth: 128,
  sameDeviceOnly: true,
  permissionPolicy: "report-only",
  traversalPolicyPlanId: "plan-1",
  emitPolicy: {
    batchMaxItems: 1024,
    progressIntervalMs: 250,
  },
} as const;

const validEnvelope = {
  schemaVersion: 1,
  requestId: "request-1",
  scanId: "scan-1",
  stageId: "stage-1",
  issuedAtMs: 1_765_000_000_000,
  nonce: "0123456789abcdef",
  operation: "scan.enumerate",
  payload: validPayload,
} as const;

describe("helperProtocol", () => {
  it("accepts a bounded read-only enumerate request", () => {
    const parsed = HelperRequestEnvelopeSchema.safeParse(validEnvelope);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.operation).toBe("scan.enumerate");
      expect(parsed.data.payload.permissionPolicy).toBe("report-only");
    }
  });

  it("rejects unknown helper operations", () => {
    const parsed = HelperRequestEnvelopeSchema.safeParse({
      ...validEnvelope,
      operation: "file.delete",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects relative or non-normalized scan roots", () => {
    expect(
      HelperScanEnumeratePayloadSchema.safeParse({
        ...validPayload,
        root: "Users/tester",
        plannedRoots: ["Users/tester"],
      }).success,
    ).toBe(false);
    expect(
      HelperScanEnumeratePayloadSchema.safeParse({
        ...validPayload,
        root: "/Users/tester/../admin",
        plannedRoots: ["/Users/tester/../admin"],
      }).success,
    ).toBe(false);
  });

  it("requires the root to be present in the main-process volume plan", () => {
    const parsed = HelperScanEnumeratePayloadSchema.safeParse({
      ...validPayload,
      root: "/Library",
      plannedRoots: ["/Users/tester"],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects unbounded emit policy inputs", () => {
    const parsed = HelperScanEnumeratePayloadSchema.safeParse({
      ...validPayload,
      emitPolicy: {
        batchMaxItems: 20_001,
        progressIntervalMs: 5_001,
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts structured helper events and rejects estimated results", () => {
    expect(
      HelperEventSchema.safeParse({
        type: "entry_batch",
        requestId: "request-1",
        items: [
          {
            path: "/Users/tester/file.txt",
            parentPath: "/Users/tester",
            kind: "file",
            size: 32,
            estimated: false,
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      HelperEventSchema.safeParse({
        type: "done",
        requestId: "request-1",
        estimated: true,
        elapsedMs: 10,
      }).success,
    ).toBe(false);
  });
});
