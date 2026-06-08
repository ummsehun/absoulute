/* @vitest-environment jsdom */

import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/renderer/src/App";

const scanExactRoot = vi.fn();

vi.mock("../../src/renderer/src/hooks/useScanLogic", () => ({
  useScanLogic: () => ({
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
    elevationRequired: null,
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
  }),
}));

vi.mock("../../src/renderer/src/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../src/renderer/src/components/LandingView", () => ({
  LandingView: () => <div>landing</div>,
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
