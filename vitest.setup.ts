import { vi } from "vitest";
import { z } from "zod";

const ScanStartResSchema = z.object({ scanId: z.string().min(1) });
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
    const data = { scanId: "scan-test-1" };
    return { ok: true, data: ScanStartResSchema.parse(data) };
  }),

  scanPause: vi.fn(async () => ({ ok: true, data: { ok: true } })),
  scanResume: vi.fn(async () => ({ ok: true, data: { ok: true } })),

  scanCancel: vi.fn(async () => {
    const data = { ok: true };
    return { ok: true, data: ScanCancelResSchema.parse(data) };
  }),

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
