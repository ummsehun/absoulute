/* @vitest-environment node */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ScanProgressBatch } from "../../src/types/contracts";
import { DiskScanService } from "../../src/main/services/diskScanService";

describe("DiskScanService", () => {
  it("emits real progress batches with deltas and patches", async () => {
    const workspaceTempBase = path.join(process.cwd(), ".tmp-tests");
    await fs.mkdir(workspaceTempBase, { recursive: true });
    const tempRoot = await fs.mkdtemp(path.join(workspaceTempBase, "dv-scan-"));
    const nested = path.join(tempRoot, "nested");
    const nestedChild = path.join(nested, "child");

    await fs.mkdir(nestedChild, { recursive: true });
    await fs.writeFile(path.join(tempRoot, "a.txt"), "abc");
    await fs.writeFile(path.join(nested, "b.txt"), "hello-world");
    await fs.writeFile(path.join(nestedChild, "c.txt"), "1234567890");

    const service = new DiskScanService();
    const batches: ScanProgressBatch[] = [];
    const errors: string[] = [];

    const stopProgress = service.onProgress((batch) => {
      batches.push(batch);
    });
    const stopErrors = service.onError((error) => {
      errors.push(error.code);
    });

    try {
      await service.startScan({
        rootPath: tempRoot,
        optInProtected: false,
      });

      await waitFor(
        () => batches.some((batch) => batch.progress.phase === "finalizing"),
        4000,
      );

      const allDeltas = batches.flatMap((batch) => batch.deltas);
      const allPatches = batches.flatMap((batch) => batch.patches);

      expect(batches.length).toBeGreaterThan(0);
      expect(allDeltas.length).toBeGreaterThan(0);
      expect(allDeltas.some((delta) => delta.sizeDelta > 0)).toBe(true);
      expect(allPatches.length).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally {
      stopProgress();
      stopErrors();
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }

    await sleep(30);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
