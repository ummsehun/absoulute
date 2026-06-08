/* @vitest-environment jsdom */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeFileIcon } from "../../src/renderer/src/components/icons";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
  vi.mocked(window.electronAPI.getFileIcon).mockClear();
});

describe("NativeFileIcon", () => {
  it("does not fetch native macOS icons for directory nodes", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    root.render(
      <NativeFileIcon
        path="/Applications/Claude.app"
        name="Claude.app"
        kind="directory"
      />,
    );

    await nextFrame();

    expect(window.electronAPI.getFileIcon).not.toHaveBeenCalled();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
