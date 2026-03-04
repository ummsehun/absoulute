/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { ScanManager } from "../../src/main/manager/scanManager";
import type {
  AppError,
  ScanProgressBatch,
  ScanStartRequest,
} from "../../src/types/contracts";

describe("ScanManager", () => {
  it("returns E_PHASE_GATE when pause is requested before running state", async () => {
    const service = new StubDiskScanService();
    const manager = new ScanManager(service.asDiskScanService());

    const result = await manager.pause("scan-missing");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("E_PHASE_GATE");
    }
  });

  it("blocks concurrent starts and allows new start after finalizing transition", async () => {
    const service = new StubDiskScanService();
    const manager = new ScanManager(service.asDiskScanService());

    const first = await manager.start(makeStartInput("/tmp"));
    expect(first.ok).toBe(true);

    const second = await manager.start(makeStartInput("/tmp"));
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("E_PHASE_GATE");
    }

    if (first.ok) {
      service.emitProgress(makeProgressBatch(first.data.scanId, "finalizing"));
      await Promise.resolve();
    }

    const third = await manager.start(makeStartInput("/tmp"));
    expect(third.ok).toBe(true);
  });

  it("enforces pause/resume transition order", async () => {
    const service = new StubDiskScanService();
    const manager = new ScanManager(service.asDiskScanService());

    const started = await manager.start(makeStartInput("/tmp"));
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }

    const resumeBeforePause = await manager.resume(started.data.scanId);
    expect(resumeBeforePause.ok).toBe(false);
    if (!resumeBeforePause.ok) {
      expect(resumeBeforePause.error.code).toBe("E_PHASE_GATE");
    }

    const paused = await manager.pause(started.data.scanId);
    expect(paused.ok).toBe(true);

    const resumed = await manager.resume(started.data.scanId);
    expect(resumed.ok).toBe(true);
  });
});

class StubDiskScanService {
  private id = 0;
  private readonly activeScans = new Set<string>();
  private readonly progressListeners = new Set<(batch: ScanProgressBatch) => void>();
  private readonly quickReadyListeners = new Set<(event: unknown) => void>();
  private readonly diagnosticsListeners = new Set<(event: unknown) => void>();
  private readonly errorListeners = new Set<(error: AppError) => void>();

  asDiskScanService() {
    return this as unknown as import("../../src/main/services/diskScanService").DiskScanService;
  }

  onProgress(listener: (batch: ScanProgressBatch) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  onError(listener: (error: AppError) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onQuickReady(listener: (event: unknown) => void): () => void {
    this.quickReadyListeners.add(listener);
    return () => this.quickReadyListeners.delete(listener);
  }

  onDiagnostics(listener: (event: unknown) => void): () => void {
    this.diagnosticsListeners.add(listener);
    return () => this.diagnosticsListeners.delete(listener);
  }

  emitProgress(batch: ScanProgressBatch): void {
    for (const listener of this.progressListeners) {
      listener(batch);
    }
  }

  emitError(error: AppError): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  async startScan(): Promise<{ scanId: string; startedAt: number }> {
    this.id += 1;
    const scanId = `scan-${this.id}`;
    this.activeScans.add(scanId);
    return { scanId, startedAt: Date.now() };
  }

  pauseScan(scanId: string): { ok: boolean } {
    return { ok: this.activeScans.has(scanId) };
  }

  resumeScan(scanId: string): { ok: boolean } {
    return { ok: this.activeScans.has(scanId) };
  }

  cancelScan(scanId: string): boolean {
    const exists = this.activeScans.has(scanId);
    if (exists) {
      this.activeScans.delete(scanId);
    }
    return exists;
  }
}

function makeStartInput(rootPath: string): ScanStartRequest {
  return {
    rootPath,
    optInProtected: false,
  };
}

function makeProgressBatch(
  scanId: string,
  phase: ScanProgressBatch["progress"]["phase"],
): ScanProgressBatch {
  return {
    progress: {
      scanId,
      phase,
      scanStage: "deep",
      scannedCount: 0,
      totalBytes: 0,
      currentPath: "/tmp",
    },
    deltas: [],
    patches: [],
  };
}
