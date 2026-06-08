/* @vitest-environment jsdom */

import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingView } from "../../src/renderer/src/components/LandingView";

vi.mock("../../src/renderer/src/components/DriveSelector", () => ({
  DriveSelector: () => <div data-testid="drive-selector" />,
}));

vi.mock("../../src/renderer/src/components/SpaceLens3D", () => ({
  SpaceLens3D: () => <div data-testid="space-lens-3d" />,
}));

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

describe("LandingView", () => {
  it("shows a single scan action on the first screen", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(
      <LandingView
        apiReady
        rootPath="/Users/user"
        setRootPath={() => undefined}
        oneClickScan={() => undefined}
      />,
    );

    await nextFrame();

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toContain("SCAN");
  });

  it("shows Full Disk Access actions when startup preflight is denied", async () => {
    const requestFullDiskAccess = vi.fn();
    const checkFullDiskAccess = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(
      <LandingView
        apiReady
        rootPath="/"
        setRootPath={() => undefined}
        oneClickScan={() => undefined}
        fullDiskAccessStatus={{
          platform: "darwin",
          required: true,
          granted: false,
          canRequest: true,
          deniedPaths: ["/Users/user/Library/Messages"],
          probes: [],
        }}
        onRequestFullDiskAccess={requestFullDiskAccess}
        onCheckFullDiskAccess={checkFullDiskAccess}
      />,
    );

    await nextFrame();

    expect(container.textContent).toContain("Full Disk Access");
    expect(container.textContent).toContain("/Users/user/Library/Messages");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.some((button) => button.textContent?.includes("권한 허용"))).toBe(true);
    expect(buttons.some((button) => button.textContent?.includes("다시 확인"))).toBe(true);
  });
});

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
