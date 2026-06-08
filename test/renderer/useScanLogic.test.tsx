/* @vitest-environment jsdom */

import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScanLogic } from "../../src/renderer/src/hooks/useScanLogic";

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.mocked(window.electronAPI.checkFullDiskAccess).mockReset();
  vi.mocked(window.electronAPI.checkFullDiskAccess).mockResolvedValue({
    ok: true,
    data: {
      platform: "darwin",
      required: false,
      granted: true,
      canRequest: true,
      deniedPaths: [],
      probes: [],
    },
  });
});

describe("useScanLogic", () => {
  it("defaults the scan target to /Users instead of the process directory", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(<RootPathProbe />);

    await nextFrame();

    expect(container.textContent).toBe("/Users");
  });

  it("does not show an error when Full Disk Access settings are opened but permission is not granted yet", async () => {
    const electronAPI = window.electronAPI;
    const originalRequestElevation = electronAPI.requestElevation;
    electronAPI.requestElevation = vi.fn(async () => ({
      ok: true as const,
      data: { granted: false },
    }));
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(<ElevationProbe />);

    await nextFrame();
    await nextFrame();

    expect(container.textContent).toContain("no-error");
    expect(container.textContent).toContain("pending");
    electronAPI.requestElevation = originalRequestElevation;
  });

  it("checks Full Disk Access on startup and exposes denied paths", async () => {
    vi.mocked(window.electronAPI.checkFullDiskAccess).mockResolvedValueOnce({
      ok: true,
      data: {
        platform: "darwin",
        required: true,
        granted: false,
        canRequest: true,
        deniedPaths: ["/Users/tester/Library/Messages"],
        probes: [
          {
            path: "/Users/tester/Library/Messages",
            readable: false,
          },
        ],
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(<FullDiskAccessProbe />);

    await nextFrame();
    await nextFrame();

    expect(window.electronAPI.checkFullDiskAccess).toHaveBeenCalled();
    expect(container.textContent).toContain("missing");
    expect(container.textContent).toContain("/Users/tester/Library/Messages");
  });

  it("keeps helper registration errors visible after refreshing helper status", async () => {
    vi.mocked(window.electronAPI.registerHelper).mockResolvedValueOnce({
      ok: false,
      error: {
        code: "E_IO",
        message: "Failed to register helper",
        recoverable: true,
        details: {
          raw: "registration-install-preflight-blocked:team-id-missing",
        },
      },
    });
    vi.mocked(window.electronAPI.getHelperStatus).mockResolvedValue({
      ok: true,
      data: {
        available: false,
        lifecycle: {
          state: "not-implemented",
          reason: "xpc-transport-not-implemented",
          checks: {
            "service-management": "unknown",
            "helper-install": "unknown",
            "caller-identity": "unknown",
            "full-disk-access": "unknown",
            "xpc-channel": "fail",
          },
        },
        reason: "xpc-transport-not-implemented",
        transport: "xpc",
      },
    });
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(<HelperRegistrationProbe />);

    await nextFrame();
    await nextFrame();
    await nextFrame();

    expect(window.electronAPI.registerHelper).toHaveBeenCalled();
    expect(window.electronAPI.getHelperStatus).toHaveBeenCalled();
    expect(container.textContent).toContain("Failed to register helper");
  });
});

function RootPathProbe() {
  const { rootPath } = useScanLogic();
  return <div>{rootPath}</div>;
}

function ElevationProbe() {
  const { elevationRequired, error, resolveElevation } = useScanLogic();
  React.useEffect(() => {
    void resolveElevation("/Users/tester/Library/Messages");
  }, [resolveElevation]);

  return (
    <div>
      <span>{error ? error.message : "no-error"}</span>
      <span>{elevationRequired ? "pending" : "cleared"}</span>
    </div>
  );
}

function FullDiskAccessProbe() {
  const { fullDiskAccessStatus } = useScanLogic();
  return (
    <div>
      <span>{fullDiskAccessStatus?.granted ? "granted" : "missing"}</span>
      <span>{fullDiskAccessStatus?.deniedPaths[0] ?? "no-path"}</span>
    </div>
  );
}

function HelperRegistrationProbe() {
  const { error, registerHelper } = useScanLogic();
  React.useEffect(() => {
    void registerHelper();
  }, [registerHelper]);

  return <div>{error ? error.message : "no-error"}</div>;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
