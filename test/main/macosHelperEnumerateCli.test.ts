/* @vitest-environment node */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { HelperEventSchema } from "../../src/shared/schemas/helperProtocol";

const helperBinaryPath = path.join(
  process.cwd(),
  "resources",
  "bin",
  "helper-enumerate-macos",
);

describe("macOS helper enumerate CLI", () => {
  it("emits helper protocol events for read-only directory enumeration", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "diskviz-helper-enum-"));
    fs.writeFileSync(path.join(root, "a.txt"), "alpha");
    fs.mkdirSync(path.join(root, "nested"));
    fs.writeFileSync(path.join(root, "nested", "b.txt"), "bravo");

    try {
      const normalizedRoot = fs.realpathSync(root);
      const request = {
        schemaVersion: 1,
        requestId: "request-1",
        scanId: "scan-1",
        stageId: "deep",
        operation: "scan.enumerate",
        issuedAtMs: Date.now(),
        nonce: "0123456789abcdef",
        payload: {
          root: normalizedRoot,
          scanMode: "deep",
          accuracyMode: "full",
          volumePolicy: "same-device",
          plannedRoots: [normalizedRoot],
          maxDepth: 8,
          sameDeviceOnly: true,
          permissionPolicy: "report-only",
          traversalPolicyPlanId: "plan-1",
          emitPolicy: {
            batchMaxItems: 32,
            progressIntervalMs: 250,
          },
        },
      };

      const result = spawnSync(helperBinaryPath, {
        encoding: "utf8",
        input: `${JSON.stringify(request)}\n`,
      });

      expect(result.status).toBe(0);
      const events = result.stdout
        .trim()
        .split("\n")
        .map((line) => HelperEventSchema.parse(JSON.parse(line)));

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
      expect(entryPaths).toEqual(
        expect.arrayContaining([
          path.join(normalizedRoot, "a.txt"),
          path.join(normalizedRoot, "nested"),
          path.join(normalizedRoot, "nested", "b.txt"),
        ]),
      );
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});
