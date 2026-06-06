/* @vitest-environment jsdom */

import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisualizationFooter } from "../../src/renderer/src/components/VisualizationFooter";

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

describe("VisualizationFooter", () => {
  it("calls exact recheck action from the result footer", async () => {
    const onExactRecheck = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);

    createRoot(container).render(
      <VisualizationFooter
        selectedCount={0}
        selectedSize={0}
        blockedByPermission={1}
        skippedByScope={0}
        nonRemovableVisible={0}
        clearSelection={() => undefined}
        onExactRecheck={onExactRecheck}
      />,
    );

    await nextFrame();
    const button = getButtonByText(container, "Exact Recheck");
    button.click();

    expect(onExactRecheck).toHaveBeenCalledTimes(1);
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
