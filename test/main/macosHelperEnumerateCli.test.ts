/* @vitest-environment node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { HelperEventSchema } from "../../src/shared/schemas/helperProtocol";
import type { HelperEvent } from "../../src/shared/schemas/helperProtocol";

const helperBinaryPath = path.join(
  process.cwd(),
  "resources",
  "bin",
  "helper-enumerate-macos",
);

function buildRequest(
  root: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    requestId: "request-1",
    scanId: "scan-1",
    stageId: "deep",
    operation: "scan.enumerate",
    issuedAtMs: Date.now(),
    nonce: "0123456789abcdef",
    payload: {
      root,
      scanMode: "deep",
      accuracyMode: "full",
      volumePolicy: "same-device",
      plannedRoots: [root],
      maxDepth: 8,
      sameDeviceOnly: true,
      permissionPolicy: "report-only",
      traversalPolicyPlanId: "plan-1",
      emitPolicy: {
        batchMaxItems: 32,
        progressIntervalMs: 250,
      },
    },
    ...overrides,
  };
}

function runHelper(request: Record<string, unknown>) {
  return spawnSync(helperBinaryPath, {
    encoding: "utf8",
    input: `${JSON.stringify(request)}\n`,
  });
}

function parseEvents(stdout: string): HelperEvent[] {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => HelperEventSchema.parse(JSON.parse(line)));
}

describe("macOS helper enumerate CLI", () => {
  it("emits helper protocol events for read-only directory enumeration", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "diskviz-helper-enum-"));
    fs.writeFileSync(path.join(root, "a.txt"), "alpha");
    fs.mkdirSync(path.join(root, "nested"));
    fs.writeFileSync(path.join(root, "nested", "b.txt"), "bravo");

    try {
      const normalizedRoot = fs.realpathSync(root);
      const result = runHelper(buildRequest(normalizedRoot));

      expect(result.status).toBe(0);
      const events = parseEvents(result.stdout);

      expect(events.map((event) => event.type)).toContain("ready");
      expect(events.map((event) => event.type)).toContain("entry_batch");
      expect(events.at(-1)).toMatchObject({
        type: "done",
        requestId: "request-1",
        estimated: false,
      });

      const entryPaths = events
        .filter((event) => event.type === "entry_batch")
        .flatMap((event) => event.items.map((item) => item.path));
      const entries = events
        .filter((event) => event.type === "entry_batch")
        .flatMap((event) => event.items);
      expect(entryPaths).toEqual(
        expect.arrayContaining([
          path.join(normalizedRoot, "a.txt"),
          path.join(normalizedRoot, "nested"),
          path.join(normalizedRoot, "nested", "b.txt"),
        ]),
      );
      expect(
        entries.every((entry) => entry.deviceId && entry.deviceId !== "unknown"),
      ).toBe(true);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it("enumerates package descendants instead of applying app-level skip policy", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "diskviz-helper-enum-"));
    const packageContents = path.join(root, "Fixture.app", "Contents");
    fs.mkdirSync(packageContents, { recursive: true });
    fs.writeFileSync(path.join(packageContents, "Info.plist"), "plist");

    try {
      const normalizedRoot = fs.realpathSync(root);
      const result = runHelper(buildRequest(normalizedRoot));

      expect(result.status).toBe(0);
      const events = parseEvents(result.stdout);
      const entryPaths = events
        .filter((event) => event.type === "entry_batch")
        .flatMap((event) => event.items.map((item) => item.path));

      expect(entryPaths).toEqual(
        expect.arrayContaining([
          path.join(normalizedRoot, "Fixture.app"),
          path.join(normalizedRoot, "Fixture.app", "Contents"),
          path.join(normalizedRoot, "Fixture.app", "Contents", "Info.plist"),
        ]),
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it("reports and excludes cross-device entries when sameDeviceOnly is enabled", () => {
    const root = "/System/Volumes";
    const rootDevice = fs.statSync(root).dev;
    const crossDeviceChild = fs.readdirSync(root)
      .map((name) => path.join(root, name))
      .find((candidate) => {
        try {
          return fs.statSync(candidate).dev !== rootDevice;
        } catch {
          return false;
        }
      });

    if (!crossDeviceChild) {
      return;
    }

    const request = buildRequest(root, {
      payload: {
        ...(buildRequest(root).payload as Record<string, unknown>),
        maxDepth: 1,
      },
    });
    const result = runHelper(request);

    expect(result.status).toBe(0);
    const events = parseEvents(result.stdout);
    const entryPaths = events
      .filter((event) => event.type === "entry_batch")
      .flatMap((event) => event.items.map((item) => item.path));
    const scopeWarnings = events.filter(
      (event) => event.type === "warn" && event.code === "E_SCOPE",
    );

    expect(entryPaths).not.toContain(crossDeviceChild);
    expect(scopeWarnings).toEqual([
      expect.objectContaining({
        type: "warn",
        requestId: "request-1",
        code: "E_SCOPE",
        path: crossDeviceChild,
      }),
    ]);
  });

  it("rejects requests when the root is outside the planned roots", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "diskviz-helper-enum-"));

    try {
      const normalizedRoot = fs.realpathSync(root);
      const request = buildRequest(normalizedRoot, {
        payload: {
          ...(buildRequest(normalizedRoot).payload as Record<string, unknown>),
          plannedRoots: ["/Users/not-the-selected-root"],
        },
      });

      const result = runHelper(request);

      expect(result.status).not.toBe(0);
      const events = parseEvents(result.stdout);

      expect(events).toEqual([
        expect.objectContaining({
          type: "error",
          requestId: "request-1",
          code: "E_INVALID_REQUEST",
        }),
      ]);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects requests with unsupported operations", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "diskviz-helper-enum-"));

    try {
      const normalizedRoot = fs.realpathSync(root);
      const request = buildRequest(normalizedRoot, {
        operation: "file.delete",
      });

      const result = runHelper(request);

      expect(result.status).not.toBe(0);
      const events = parseEvents(result.stdout);

      expect(events).toEqual([
        expect.objectContaining({
          type: "error",
          requestId: "request-1",
          code: "E_INVALID_REQUEST",
        }),
      ]);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects requests that violate helper protocol bounds", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "diskviz-helper-enum-"));

    try {
      const normalizedRoot = fs.realpathSync(root);
      const validPayload = buildRequest(normalizedRoot).payload as Record<string, unknown>;
      const invalidRequests = [
        buildRequest(normalizedRoot, { schemaVersion: 2 }),
        buildRequest(normalizedRoot, { requestId: "" }),
        buildRequest(normalizedRoot, { nonce: "too-short" }),
        buildRequest(normalizedRoot, {
          payload: { ...validPayload, root: "relative/path" },
        }),
        buildRequest(normalizedRoot, {
          payload: { ...validPayload, volumePolicy: "all-devices" },
        }),
        buildRequest(normalizedRoot, {
          payload: {
            ...validPayload,
            volumePolicy: "same-device",
            sameDeviceOnly: false,
          },
        }),
        buildRequest(normalizedRoot, {
          payload: {
            ...validPayload,
            volumePolicy: "root-cross-device",
            sameDeviceOnly: true,
          },
        }),
        buildRequest(normalizedRoot, {
          payload: { ...validPayload, permissionPolicy: "open-settings" },
        }),
        buildRequest(normalizedRoot, {
          payload: { ...validPayload, maxDepth: 513 },
        }),
        buildRequest(normalizedRoot, {
          payload: {
            ...validPayload,
            emitPolicy: {
              batchMaxItems: 20_001,
              progressIntervalMs: 5_001,
            },
          },
        }),
      ];

      for (const request of invalidRequests) {
        const result = runHelper(request);
        expect(result.status).not.toBe(0);
        expect(parseEvents(result.stdout)).toEqual([
          expect.objectContaining({
            type: "error",
            requestId: typeof request.requestId === "string" && request.requestId
              ? request.requestId
              : "unknown",
            code: "E_INVALID_REQUEST",
          }),
        ]);
      }
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});
