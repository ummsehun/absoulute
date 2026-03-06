import { describe, expect, it } from "vitest";

describe("renderer electronAPI mock", () => {
  it("injects scan API in test runtime", async () => {
    expect(window.electronAPI).toBeDefined();
    const defaultRoot = await window.electronAPI.getDefaultScanRoot();
    expect(defaultRoot.ok).toBe(true);

    const result = await window.electronAPI.scanStart({
      rootPath: ".",
      optInProtected: false,
    });

    expect(result.ok).toBe(true);

    const pause = await window.electronAPI.scanPause("scan-test-1");
    expect(pause.ok).toBe(true);

    const resume = await window.electronAPI.scanResume("scan-test-1");
    expect(resume.ok).toBe(true);

    const unsubscribeQuick = window.electronAPI.onScanQuickReady((event) => {
      expect(event.scanId).toBe("scan-test-1");
    });
    const unsubscribeDiagnostics = window.electronAPI.onScanDiagnostics((event) => {
      expect(event.scanId).toBe("scan-test-1");
    });
    const unsubscribeTerminal = window.electronAPI.onScanTerminal((event) => {
      expect(event.scanId).toBe("scan-test-1");
    });
    unsubscribeQuick();
    unsubscribeDiagnostics();
    unsubscribeTerminal();
  });

  it("injects window API in test runtime", async () => {
    const state = await window.electronAPI.getWindowState();
    expect(state.ok).toBe(true);

    const minimize = await window.electronAPI.minimizeWindow();
    expect(minimize.ok).toBe(true);

    const toggle = await window.electronAPI.toggleMaximizeWindow();
    expect(toggle.ok).toBe(true);
  });
});
