/* @vitest-environment jsdom */

import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScanLogic } from "../../src/renderer/src/hooks/useScanLogic";

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
