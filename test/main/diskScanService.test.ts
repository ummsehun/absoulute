/* @vitest-environment node */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
    ScanDiagnostics,
    ScanProgressBatch,
    ScanQuickReady,
    ScanTerminalEvent,
} from "../../src/types/contracts";
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
    await Promise.all(
      Array.from({ length: 320 }, (_, index) =>
        fs.writeFile(path.join(nestedChild, `bulk-${index}.txt`), `payload-${index}`),
      ),
    );

    const service = new DiskScanService();
    const batches: ScanProgressBatch[] = [];
    const quickReadyEvents: ScanQuickReady[] = [];
    const diagnosticsEvents: ScanDiagnostics[] = [];
    const terminalEvents: ScanTerminalEvent[] = [];
    const errors: string[] = [];

    const stopProgress = service.onProgress((batch) => {
      batches.push(batch);
    });
    const stopErrors = service.onError((error) => {
      errors.push(error.code);
    });
    const stopQuickReady = service.onQuickReady((event) => {
      quickReadyEvents.push(event);
    });
    const stopDiagnostics = service.onDiagnostics((event) => {
      diagnosticsEvents.push(event);
    });
    const stopTerminal = service.onTerminal((event) => {
      terminalEvents.push(event);
    });

    try {
      const started = await service.startScan({
        rootPath: tempRoot,
        optInProtected: false,
      });

      await waitFor(() => batches.length > 0, 4000);

      const pausedAccepted = await waitForPauseAcceptance(
        () => service.pauseScan(started.scanId),
        () => batches.some((batch) => batch.progress.phase === "finalizing"),
        1500,
      );

      if (pausedAccepted) {
        await waitFor(
          () => batches.some((batch) => batch.progress.phase === "paused"),
          4000,
        );

        const resumed = service.resumeScan(started.scanId);
        expect(resumed.ok).toBe(true);
      } else {
        expect(batches.some((batch) => batch.progress.phase === "finalizing")).toBe(true);
      }

      await waitFor(
        () => batches.some((batch) => batch.progress.phase === "finalizing"),
        4000,
      );
      await waitFor(() => terminalEvents.length > 0, 4000);

      const allDeltas = batches.flatMap((batch) => batch.deltas);
      const allPatches = batches.flatMap((batch) => batch.patches);

      expect(batches.length).toBeGreaterThan(0);
      expect(allDeltas.length).toBeGreaterThan(0);
      expect(allDeltas.some((delta) => delta.sizeDelta > 0)).toBe(true);
      expect(allPatches.length).toBeGreaterThan(0);
      expect(quickReadyEvents.length).toBeGreaterThan(0);
      expect(diagnosticsEvents.length).toBeGreaterThan(0);
      expect(terminalEvents.at(-1)?.status).toBe("done");
      expect(errors).toEqual([]);
    } finally {
      stopProgress();
      stopErrors();
      stopQuickReady();
      stopDiagnostics();
      stopTerminal();
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

async function waitForPauseAcceptance(
  pauseAction: () => { ok: boolean },
  donePredicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (donePredicate()) {
      return false;
    }

    const paused = pauseAction();
    if (paused.ok) {
      return true;
    }

    await sleep(20);
  }

  return false;
}
