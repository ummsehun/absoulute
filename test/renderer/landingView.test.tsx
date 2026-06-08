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

  it("shows helper registration actions when ServiceManagement is not installed", async () => {
    const registerHelper = vi.fn();
    const checkHelperStatus = vi.fn();
    const requestFullDiskAccess = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(
      <LandingView
        apiReady
        rootPath="/"
        setRootPath={() => undefined}
        oneClickScan={() => undefined}
        helperStatus={{
          available: false,
          lifecycle: {
            state: "not-installed",
            reason: "not-found",
            checks: {
              "service-management": "fail",
              "helper-install": "unknown",
              "caller-identity": "unknown",
              "full-disk-access": "unknown",
              "xpc-channel": "fail",
            },
          },
          readinessBlockers: ["service-management-not-registered"],
          reason: "not-found",
          transport: "xpc",
        }}
        onRegisterHelper={registerHelper}
        onCheckHelperStatus={checkHelperStatus}
        onRequestFullDiskAccess={requestFullDiskAccess}
      />,
    );

    await nextFrame();

    expect(container.textContent).toContain("Helper 등록 필요");
    expect(container.textContent).toContain("service-management-not-registered");
    const buttons = Array.from(container.querySelectorAll("button"));
    buttons.find((button) => button.textContent === "Helper 등록")?.click();
    buttons.find((button) => button.textContent === "FDA 설정")?.click();
    buttons.find((button) => button.textContent === "상태 확인")?.click();
    expect(registerHelper).toHaveBeenCalled();
    expect(requestFullDiskAccess).toHaveBeenCalled();
    expect(checkHelperStatus).toHaveBeenCalled();
  });
});

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
