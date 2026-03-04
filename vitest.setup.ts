import { vi } from "vitest";
import { z } from "zod";

const ScanStartResSchema = z.object({ scanId: z.string().min(1) });
const ScanCancelResSchema = z.object({ ok: z.boolean() });

const electronAPIMock = {
  getSystemInfo: vi.fn(async () => ({
    ok: true,
    data: { platform: "darwin", arch: "arm64", release: "test" },
  })),
  scanStart: vi.fn(async () => {
    const data = { scanId: "scan-test-1" };
    return { ok: true, data: ScanStartResSchema.parse(data) };
  }),
  scanCancel: vi.fn(async () => {
    const data = { ok: true };
    return { ok: true, data: ScanCancelResSchema.parse(data) };
  }),
  onScanProgressBatch: vi.fn((cb: (batch: unknown) => void) => {
    cb({
      progress: {
        scanId: "scan-test-1",
        phase: "walking",
        scannedCount: 1,
        totalBytes: 128,
      },
      deltas: [],
      patches: [],
    });
    return () => undefined;
  }),
  onScanError: vi.fn(() => () => undefined),
};

vi.stubGlobal("electronAPI", electronAPIMock);
if (typeof window !== "undefined") {
  Object.defineProperty(window, "electronAPI", {
    value: electronAPIMock,
    writable: true,
  });
}
