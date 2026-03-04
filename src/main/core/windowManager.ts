import { BrowserWindow } from "electron";
import path from "node:path";
import type { WindowState } from "../../types/contracts";

export interface WindowManagerOptions {
  preloadPath: string;
  rendererHtmlPath: string;
  rendererDevUrl?: string;
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private readonly stateListeners = new Set<(state: WindowState) => void>();

  constructor(private readonly options: WindowManagerOptions) { }

  createMainWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: 1366,
      height: 900,
      minWidth: 1000,
      minHeight: 700,
      show: false,
      backgroundColor: "#00000000",
      transparent: true,
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 20, y: 20 },
      vibrancy: "under-window",
      visualEffectState: "active",
      title: "Space Lens",
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    this.mainWindow = window;
    this.attachStateEvents(window);

    const rendererDevUrl = this.options.rendererDevUrl;
    if (rendererDevUrl) {
      void window.loadURL(rendererDevUrl);
    } else {
      void window.loadFile(path.resolve(this.options.rendererHtmlPath));
    }

    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.show();
      }
      this.emitState();
    });

    window.on("closed", () => {
      this.mainWindow = null;
    });

    return window;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  getState(): WindowState | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return null;
    }

    return {
      isFocused: this.mainWindow.isFocused(),
      isMaximized: this.mainWindow.isMaximized(),
      isMinimized: this.mainWindow.isMinimized(),
      isFullScreen: this.mainWindow.isFullScreen(),
      isVisible: this.mainWindow.isVisible(),
    };
  }

  minimize(): boolean {
    const window = this.mainWindow;
    if (!window || window.isDestroyed()) {
      return false;
    }

    window.minimize();
    return true;
  }

  toggleMaximize(): boolean {
    const window = this.mainWindow;
    if (!window || window.isDestroyed()) {
      return false;
    }

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }

    return true;
  }

  close(): boolean {
    const window = this.mainWindow;
    if (!window || window.isDestroyed()) {
      return false;
    }

    window.close();
    return true;
  }

  focusOrRestore(): void {
    const window = this.mainWindow;
    if (!window || window.isDestroyed()) {
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window.focus();
  }

  onStateChanged(listener: (state: WindowState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private attachStateEvents(window: BrowserWindow): void {
    const emit = () => {
      this.emitState();
    };

    window.on("focus", emit);
    window.on("blur", emit);
    window.on("maximize", emit);
    window.on("unmaximize", emit);
    window.on("minimize", emit);
    window.on("restore", emit);
    window.on("enter-full-screen", emit);
    window.on("leave-full-screen", emit);
    window.on("show", emit);
    window.on("hide", emit);
  }

  private emitState(): void {
    const state = this.getState();
    if (!state) {
      return;
    }

    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}
