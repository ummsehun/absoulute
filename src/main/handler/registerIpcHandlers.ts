import { ipcMain } from "electron";
import os from "node:os";
import { IPC_CHANNELS } from "../../shared/constants/ipcChannels";
import { ScanCancelRequestSchema, ScanStartRequestSchema } from "../../shared/schemas/scan";
import { GetSystemInfoResultSchema } from "../../shared/schemas/system";
import { ScanManager } from "../manager/scanManager";
import { makeAppError, unknownToAppError } from "../utils/appError";

export function registerIpcHandlers(scanManager: ScanManager): void {
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
      return await scanManager.start(parsed);
    } catch (error) {
      return {
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_VALIDATION", "Invalid scan start payload", true, {
            raw: String(error),
          }),
        ),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCAN_CANCEL, async (_event, input: unknown) => {
    try {
      const parsed = ScanCancelRequestSchema.parse({ scanId: input });
      return await scanManager.cancel(parsed.scanId);
    } catch (error) {
      return {
        ok: false as const,
        error: unknownToAppError(
          makeAppError("E_VALIDATION", "Invalid scan cancel payload", true, {
            raw: String(error),
          }),
        ),
      };
    }
  });
}
