/* @vitest-environment jsdom */

import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/renderer/src/App";

const scanExactRoot = vi.fn();
let appState = createCompletedAppState();

vi.mock("../../src/renderer/src/hooks/useScanLogic", () => ({
  useScanLogic: () => appState,
}));

function createCompletedAppState() {
  return {
    rootPath: "/Users",
    setRootPath: vi.fn(),
    scanId: "",
    scanTerminal: {
      scanId: "scan-test-1",
      status: "done",
      finishedAt: Date.now(),
    },
    progress: null,
    error: null,
    coverageUpdate: null,
    diagnostics: null,
    perfSample: null,
    elevationRequired: null as null | {
      scanId: string;
      targetPath: string;
      reason: string;
      policy: "manual";
    },
    fullDiskAccessStatus: null,
    helperStatus: null,
    aggregateSizes: {
      "/Users": 1024,
      "/Users/tester": 1024,
    },
    setActiveRootPath: vi.fn(),
    apiReady: true,
    visualizationRoot: "/Users",
    focusedTopItems: [["/Users/tester", 1024]],
    windowState: null,
    oneClickScan: vi.fn(),
    scanExactRoot,
    resolveElevation: vi.fn(),
    checkFullDiskAccess: vi.fn(),
    requestFullDiskAccess: vi.fn(),
    checkHelperStatus: vi.fn(),
    registerHelper: vi.fn(),
  };
}

vi.mock("../../src/renderer/src/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../src/renderer/src/components/LandingView", () => ({
  LandingView: ({
    elevationRequired,
    error,
  }: {
    elevationRequired?: { targetPath: string } | null;
    error?: { message: string } | null;
  }) => (
    <div>
      landing
      {elevationRequired ? ` elevation:${elevationRequired.targetPath}` : ""}
      {error ? ` error:${error.message}` : ""}
    </div>
  ),
}));

vi.mock("../../src/renderer/src/components/VisualizationView", () => ({
  VisualizationView: ({ onExactRecheck }: { onExactRecheck?: () => void | Promise<void> }) => (
    <button type="button" onClick={() => void onExactRecheck?.()}>
      Exact Recheck
    </button>
  ),
}));

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  scanExactRoot.mockClear();
  appState = createCompletedAppState();
});

describe("App exact recheck wiring", () => {
  it("passes the exact recheck action into the completed visualization view", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(<App />);

    await nextFrame();
    getButtonByText(container, "Exact Recheck").click();

    expect(scanExactRoot).toHaveBeenCalledTimes(1);
  });

  it("leaves the completed visualization when exact recheck requires elevation", async () => {
    appState = {
      ...createCompletedAppState(),
      elevationRequired: {
        scanId: "preflight",
        targetPath: "/Users/tester",
        reason: "Full Disk Access required",
        policy: "manual",
      },
    };
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(<App />);

    await nextFrame();

    expect(container.textContent).toContain("landing");
    expect(container.textContent).toContain("elevation:/Users/tester");
    expect(container.textContent).not.toContain("Exact Recheck");
  });
});

function getButtonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
