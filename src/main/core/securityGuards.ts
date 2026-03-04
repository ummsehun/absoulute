import { BrowserWindow, session, shell } from "electron";

const NAVIGATION_ALLOWLIST = new Set(["http://localhost:5173", "app://-"]);
const WINDOW_OPEN_ALLOWLIST = new Set<string>([]);

export function registerSecurityGuards(mainWindow: BrowserWindow): void {
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowed(url, WINDOW_OPEN_ALLOWLIST)) {
      return { action: "allow" };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowed(url, NAVIGATION_ALLOWLIST)) {
      event.preventDefault();
    }
  });

  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
}

export function registerCspPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

    const csp = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:* https://raw.githack.com https://raw.githubusercontent.com; img-src 'self' data:"
      : "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://raw.githack.com https://raw.githubusercontent.com; img-src 'self' data:";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

function isAllowed(url: string, allowlist: Set<string>): boolean {
  for (const allowed of allowlist) {
    if (url.startsWith(allowed)) {
      return true;
    }
  }

  return false;
}
