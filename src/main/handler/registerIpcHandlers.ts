import { ipcMain } from "electron";
import os from "node:os";
import { IPC_CHANNELS } from "../../shared/constants/ipcChannels";
import {
  ScanCancelRequestSchema,
  ScanStartRequestSchema,
  ScanStartResultSchema,
  ScanCancelResultSchema,
} from "../../shared/schemas/scan";
import { GetSystemInfoResultSchema } from "../../shared/schemas/system";
import {
  GetWindowStateResultSchema,
  WindowActionResultSchema,
} from "../../shared/schemas/window";
import { WindowManager } from "../core/windowManager";
import { ScanManager } from "../manager/scanManager";
import { makeAppError, unknownToAppError } from "../utils/appError";

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
