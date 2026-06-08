import { app, ipcMain } from "electron";
import os from "node:os";
import { IPC_CHANNELS } from "../../shared/constants/ipcChannels";
import {
  ScanCancelRequestSchema,
  ScanPauseRequestSchema,
  ScanPauseResultSchema,
  ScanElevationRequestSchema,
  ScanElevationResultSchema,
  ScanResumeRequestSchema,
  ScanResumeResultSchema,
  ScanStartRequestSchema,
  ScanStartResultSchema,
  ScanCancelResultSchema,
} from "../../shared/schemas/scan";
import {
  GetDefaultScanRootResultSchema,
  FullDiskAccessStatusResultSchema,
  HelperClientStatusResultSchema,
  GetSystemInfoResultSchema,
} from "../../shared/schemas/system";
import {
  GetWindowStateResultSchema,
  WindowActionResultSchema,
} from "../../shared/schemas/window";
import { WindowManager } from "../core/windowManager";
import { ScanManager } from "../manager/scanManager";
import {
  checkFullDiskAccessStatus,
  requestFullDiskAccess,
  requestElevation,
} from "../services/security/macosPrivilegeHelper";
import { makeAppError, unknownToAppError } from "../utils/appError";
import { createDefaultHelperClient } from "../services/helper/helperClient";
import { appendNativeScannerLog } from "../services/diagnostics/nativeScannerLogger";

export function registerIpcHandlers(
  scanManager: ScanManager,
  windowManager: WindowManager,
): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_SYSTEM_INFO, async () => {
    const payload = {
      ok: true as const,
      data: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
      },
    };

    return GetSystemInfoResultSchema.parse(payload);
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_FILE_ICON, async (_event, input: unknown) => {
    try {
      const filePath = String(input ?? "");
      if (!filePath) {
        return { ok: false as const, dataUrl: null };
      }
      const icon = await app.getFileIcon(filePath, { size: "large" });
      // Guard against empty NativeImage — toDataURL() on an empty image produces
      // a truthy but broken data URL ("data:image/png;base64,") that renders as a
      // broken image placeholder in the browser.
      if (icon.isEmpty()) {
        return { ok: false as const, dataUrl: null };
      }
      return { ok: true as const, dataUrl: icon.toDataURL() };
    } catch {
      return { ok: false as const, dataUrl: null };
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_DEFAULT_SCAN_ROOT, async () => {
    const payload = {
      ok: true as const,
      data: {
        path: resolveDefaultScanRoot(os.platform(), os.homedir()),
      },
    };

    return GetDefaultScanRootResultSchema.parse(payload);
  });

  ipcMain.handle(IPC_CHANNELS.APP_CHECK_FULL_DISK_ACCESS, async () => {
    try {
      return FullDiskAccessStatusResultSchema.parse({
        ok: true as const,
        data: await checkFullDiskAccessStatus(),
      });
    } catch (error) {
      return FullDiskAccessStatusResultSchema.parse({
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_IO", "Failed to check Full Disk Access status", true, {
            raw: String(error),
          }),
        ),
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_REQUEST_FULL_DISK_ACCESS, async () => {
    try {
      return FullDiskAccessStatusResultSchema.parse({
        ok: true as const,
        data: await requestFullDiskAccess(),
      });
    } catch (error) {
      return FullDiskAccessStatusResultSchema.parse({
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_IO", "Failed to open Full Disk Access settings", true, {
            raw: String(error),
          }),
        ),
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.HELPER_GET_STATUS, async () => {
    appendNativeScannerLog({
      event: "helper_status_requested",
      details: { source: "ipc" },
    });

    try {
      const data = await createDefaultHelperClient().healthCheck();
      appendNativeScannerLog({
        event: "helper_status_result",
        details: {
          available: data.available,
          lifecycleState: data.lifecycle?.state,
          reason: data.reason,
          transport: data.transport,
        },
      });

      return HelperClientStatusResultSchema.parse({
        ok: true as const,
        data,
      });
    } catch (error) {
      appendNativeScannerLog({
        event: "helper_status_failed",
        level: "error",
        details: { reason: String(error) },
      });

      return HelperClientStatusResultSchema.parse({
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_IO", "Failed to check helper status", true, {
            raw: String(error),
          }),
        ),
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.HELPER_REGISTER, async () => {
    appendNativeScannerLog({
      event: "helper_register_requested",
      details: { source: "ipc" },
    });

    try {
      const data = await createDefaultHelperClient().register();
      appendNativeScannerLog({
        event: "helper_register_result",
        details: {
          available: data.available,
          lifecycleState: data.lifecycle?.state,
          reason: data.reason,
          transport: data.transport,
        },
      });

      return HelperClientStatusResultSchema.parse({
        ok: true as const,
        data,
      });
    } catch (error) {
      appendNativeScannerLog({
        event: "helper_register_failed",
        level: "error",
        details: { reason: String(error) },
      });

      return HelperClientStatusResultSchema.parse({
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_IO", "Failed to register helper", true, {
            raw: String(error),
          }),
        ),
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCAN_START, async (_event, input: unknown) => {
    try {
      const parsed = ScanStartRequestSchema.parse(input);
      return ScanStartResultSchema.parse(await scanManager.start(parsed));
    } catch (error) {
      return ScanStartResultSchema.parse({
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_VALIDATION", "Invalid scan start payload", true, {
            raw: String(error),
          }),
        ),
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCAN_CANCEL, async (_event, input: unknown) => {
    try {
      const parsed = ScanCancelRequestSchema.parse({ scanId: input });
      return ScanCancelResultSchema.parse(await scanManager.cancel(parsed.scanId));
    } catch (error) {
      return ScanCancelResultSchema.parse({
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_VALIDATION", "Invalid scan cancel payload", true, {
            raw: String(error),
          }),
        ),
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCAN_REQUEST_ELEVATION, async (_event, input: unknown) => {
    try {
      const parsed = ScanElevationRequestSchema.parse({ targetPath: input });
      const data = await requestElevation(parsed.targetPath);
      return ScanElevationResultSchema.parse({
        ok: true as const,
        data,
      });
    } catch (error) {
      return ScanElevationResultSchema.parse({
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_IO", "Failed to open Full Disk Access settings", true, {
            raw: String(error),
          }),
        ),
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCAN_PAUSE, async (_event, input: unknown) => {
    try {
      const parsed = ScanPauseRequestSchema.parse({ scanId: input });
      return ScanPauseResultSchema.parse(await scanManager.pause(parsed.scanId));
    } catch (error) {
      return ScanPauseResultSchema.parse({
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_VALIDATION", "Invalid scan pause payload", true, {
            raw: String(error),
          }),
        ),
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCAN_RESUME, async (_event, input: unknown) => {
    try {
      const parsed = ScanResumeRequestSchema.parse({ scanId: input });
      return ScanResumeResultSchema.parse(await scanManager.resume(parsed.scanId));
    } catch (error) {
      return ScanResumeResultSchema.parse({
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_VALIDATION", "Invalid scan resume payload", true, {
            raw: String(error),
          }),
        ),
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_STATE, async () => {
    const state = windowManager.getState();
    if (!state) {
      return GetWindowStateResultSchema.parse({
        ok: false as const,
        error: makeAppError("E_IO", "Main window is not available", true),
      });
    }

    return GetWindowStateResultSchema.parse({
      ok: true as const,
      data: state,
    });
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async () => {
    const ok = windowManager.minimize();
    return WindowActionResultSchema.parse(windowActionResult(ok));
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, async () => {
    const ok = windowManager.toggleMaximize();
    return WindowActionResultSchema.parse(windowActionResult(ok));
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async () => {
    const ok = windowManager.close();
    return WindowActionResultSchema.parse(windowActionResult(ok));
  });
}

export function resolveDefaultScanRoot(
  _platform: NodeJS.Platform,
  homeDirectory: string,
): string {
  return homeDirectory;
}

function windowActionResult(ok: boolean) {
  if (ok) {
    return {
      ok: true as const,
      data: {
        ok: true,
      },
    };
  }

  return {
    ok: false as const,
    error: makeAppError("E_IO", "Main window is not available", true),
  };
}
