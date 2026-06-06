/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { mapHelperEventToNativeMessages } from "../../src/main/services/scan/helperEventAdapter";

describe("helperEventAdapter", () => {
  it("maps helper entry batches into exact native aggregation batches", () => {
    expect(
      mapHelperEventToNativeMessages({
        type: "entry_batch",
        requestId: "request-1",
        items: [
          {
            path: "/Users/tester/file.txt",
            parentPath: "/Users/tester",
            kind: "file",
            size: 42,
            estimated: false,
          },
          {
            path: "/Users/tester/Documents",
            parentPath: "/Users/tester",
            kind: "dir",
            size: 0,
            estimated: false,
          },
        ],
      }),
    ).toEqual([
      {
        type: "agg_batch",
        items: [
          {
            path: "/Users/tester/file.txt",
            sizeDelta: 42,
            countDelta: 1,
            estimated: false,
          },
          {
            path: "/Users/tester/Documents",
            sizeDelta: 0,
            countDelta: 0,
            estimated: false,
          },
        ],
      },
    ]);
  });

  it("maps helper progress into native progress without inventing queue depth", () => {
    expect(
      mapHelperEventToNativeMessages({
        type: "progress",
        requestId: "request-1",
        scannedCount: 12,
        currentPath: "/Users/tester/file.txt",
      }),
    ).toEqual([
      {
        type: "progress",
        scannedCount: 12,
        queuedDirs: 0,
        elapsedMs: 0,
        currentPath: "/Users/tester/file.txt",
      },
    ]);
  });

  it("maps helper coverage into permission-focused native coverage", () => {
    expect(
      mapHelperEventToNativeMessages({
        type: "coverage",
        requestId: "request-1",
        scannedCount: 12,
        permissionFailures: 2,
        ioFailures: 1,
      }),
    ).toEqual([
      {
        type: "coverage",
        scanned: 12,
        blockedByPolicy: 0,
        blockedByPermission: 2,
        skippedByScope: 0,
        elevationRequired: true,
      },
    ]);
  });

  it("maps helper warning codes into native warning semantics", () => {
    expect(
      mapHelperEventToNativeMessages({
        type: "warn",
        requestId: "request-1",
        code: "E_TCC_PERMISSION",
        path: "/Users/tester/Library/Mail",
        message: "Full Disk Access denied",
      }),
    ).toEqual([
      {
        type: "warn",
        code: "E_PERMISSION",
        message: "Full Disk Access denied",
        path: "/Users/tester/Library/Mail",
        recoverable: true,
      },
    ]);
  });

  it("maps terminal helper events without estimated results", () => {
    expect(
      mapHelperEventToNativeMessages({
        type: "done",
        requestId: "request-1",
        elapsedMs: 30,
        estimated: false,
      }),
    ).toEqual([
      {
        type: "done",
        elapsedMs: 30,
        estimated: false,
      },
    ]);

    expect(
      mapHelperEventToNativeMessages({
        type: "error",
        requestId: "request-1",
        code: "E_INVALID_CLIENT",
        message: "Rejected caller identity",
      }),
    ).toEqual([
      {
        type: "warn",
        code: "E_INVALID_CLIENT",
        message: "Rejected caller identity",
        recoverable: false,
      },
    ]);
  });

  it("does not emit native messages for helper readiness handshakes", () => {
    expect(
      mapHelperEventToNativeMessages({
        type: "ready",
        requestId: "request-1",
        helperVersion: "0.1.0",
      }),
    ).toEqual([]);
  });
});
