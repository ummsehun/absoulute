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
      parseNativeScannerLine(
        JSON.stringify({
          type: "agg_batch",
          items: [
            { path: "/a", sizeDelta: 12.8, countDelta: 1.2, estimated: true },
            { path: "/b", sizeDelta: -5, countDelta: -2, estimated: false },
            { path: "", sizeDelta: 10, countDelta: 1 },
          ],
        }),
      ),
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
      parseNativeScannerLine(
        JSON.stringify({
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
        }),
      ),
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
