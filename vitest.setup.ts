import { vi } from "vitest";
import { z } from "zod";

const ScanStartResSchema = z.object({
  scanId: z.string().min(1),
  startedAt: z.number().int().positive(),
});
const ScanCancelResSchema = z.object({ ok: z.boolean() });

const electronAPIMock = {
  getSystemInfo: vi.fn(async () => ({
    ok: true,
    data: { platform: "darwin", arch: "arm64", release: "test" },
  })),
  getDefaultScanRoot: vi.fn(async () => ({
    ok: true,
    data: { path: "/Users/tester" },
  })),

  scanStart: vi.fn(async () => {
    const data = { scanId: "scan-test-1", startedAt: Date.now() };
    return { ok: true, data: ScanStartResSchema.parse(data) };
  }),

  scanPause: vi.fn(async () => ({ ok: true, data: { ok: true } })),
  scanResume: vi.fn(async () => ({ ok: true, data: { ok: true } })),

  scanCancel: vi.fn(async () => {
    const data = { ok: true };
    return { ok: true, data: ScanCancelResSchema.parse(data) };
  }),

  requestElevation: vi.fn(async () => ({
    ok: true,
    data: { granted: true },
  })),

  onScanProgressBatch: vi.fn((cb: (batch: unknown) => void) => {
    cb({
      progress: {
        scanId: "scan-test-1",
        phase: "walking",
        scanStage: "quick",
        quickReady: false,
        confidence: "medium",
        estimated: true,
        scannedCount: 1,
        totalBytes: 128,
      },
      deltas: [],
      aggBatches: [],
      patches: [],
    });
    return () => undefined;
  }),

  onScanQuickReady: vi.fn((cb: (event: unknown) => void) => {
    cb({
      scanId: "scan-test-1",
      rootPath: "/",
      quickReadyAt: Date.now(),
      elapsedMs: 1200,
      scanStage: "quick",
      confidence: "medium",
      estimated: true,
    });
    return () => undefined;
  }),

  onScanDiagnostics: vi.fn((cb: (event: unknown) => void) => {
    cb({
      scanId: "scan-test-1",
      phase: "walking",
      scanStage: "quick",
      elapsedMs: 1200,
      scannedCount: 1,
      totalBytes: 128,
      queueDepth: 4,
      recoverableErrors: 0,
      permissionErrors: 0,
      ioErrors: 0,
      filesPerSec: 100,
      stageElapsedMs: 1200,
      ioWaitRatio: 0.4,
      hotPath: "/",
      coverage: {
        scanned: 1,
        blockedByPolicy: 0,
        blockedByPermission: 0,
        elevationRequired: false,
      },
    });
    return () => undefined;
  }),

  onScanCoverageUpdate: vi.fn((cb: (event: unknown) => void) => {
    cb({
      scanId: "scan-test-1",
      coverage: {
        scanned: 1,
        blockedByPolicy: 0,
        blockedByPermission: 0,
        elevationRequired: false,
      },
    });
    return () => undefined;
  }),

  onScanTerminal: vi.fn((cb: (event: unknown) => void) => {
    cb({
      scanId: "scan-test-1",
      status: "done",
      finishedAt: Date.now(),
    });
    return () => undefined;
  }),

  onScanPerfSample: vi.fn((cb: (event: unknown) => void) => {
    cb({
      scanId: "scan-test-1",
      filesPerSec: 100,
      stageElapsedMs: 1200,
      ioWaitRatio: 0.4,
      queueDepth: 4,
      hotPath: "/",
      coverage: {
        scanned: 1,
        blockedByPolicy: 0,
        blockedByPermission: 0,
        elevationRequired: false,
      },
    });
    return () => undefined;
  }),

  onScanElevationRequired: vi.fn((cb: (event: unknown) => void) => {
    cb({
      scanId: "scan-test-1",
      targetPath: "/System",
      reason: "requires elevation",
      policy: "manual",
    });
    return () => undefined;
  }),

  onScanError: vi.fn(() => () => undefined),

  getWindowState: vi.fn(async () => ({
    ok: true,
    data: {
      isFocused: true,
      isMaximized: false,
      isMinimized: false,
      isFullScreen: false,
      isVisible: true,
    },
  })),

  minimizeWindow: vi.fn(async () => ({ ok: true, data: { ok: true } })),
  toggleMaximizeWindow: vi.fn(async () => ({ ok: true, data: { ok: true } })),
  closeWindow: vi.fn(async () => ({ ok: true, data: { ok: true } })),

  onWindowStateChanged: vi.fn((cb: (state: unknown) => void) => {
    cb({
      isFocused: true,
      isMaximized: false,
      isMinimized: false,
      isFullScreen: false,
      isVisible: true,
    });
    return () => undefined;
  }),
};

vi.stubGlobal("electronAPI", electronAPIMock);
if (typeof window !== "undefined") {
  Object.defineProperty(window, "electronAPI", {
    value: electronAPIMock,
    writable: true,
  });
}
