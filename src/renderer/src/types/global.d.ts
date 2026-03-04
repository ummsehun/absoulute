import type { ElectronAPI } from "../../../types/electron-api";

export {};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
