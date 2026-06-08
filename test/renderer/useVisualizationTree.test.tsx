/* @vitest-environment jsdom */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_VISIBLE_BUBBLES,
  useVisualizationTree,
} from "../../src/renderer/src/hooks/useVisualizationTree";
import type { ListRow } from "../../src/renderer/src/components/VisualizationView";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
});

describe("useVisualizationTree", () => {
  it("keeps more root children visible before grouping the remainder as Remaining Items", async () => {
    const aggregateSizes: Record<string, number> = { "/": 2_500 };
    const focusedTopItems: Array<[string, number]> = [];
    for (let index = 0; index < MAX_VISIBLE_BUBBLES; index += 1) {
      const childPath = `/folder-${index}`;
      const size = 100 - index;
      aggregateSizes[childPath] = size;
      focusedTopItems.push([childPath, size]);
    }

    let rows: ListRow[] = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(
      <CaptureVisualizationRows
        aggregateSizes={aggregateSizes}
        focusedTopItems={focusedTopItems}
        onRows={(nextRows) => {
          rows = nextRows;
        }}
      />,
    );

    await nextFrame();

    expect(rows.filter((row) => row.kind === "directory")).toHaveLength(MAX_VISIBLE_BUBBLES);
    expect(rows.some((row) => row.name === "Remaining Items")).toBe(true);
    expect(rows.find((row) => row.kind === "other")?.description).toBe(
      "Additional entries grouped to keep this view readable",
    );
  });
});

function CaptureVisualizationRows({
  aggregateSizes,
  focusedTopItems,
  onRows,
}: {
  aggregateSizes: Record<string, number>;
  focusedTopItems: Array<[string, number]>;
  onRows: (rows: ListRow[]) => void;
}) {
  const { listRows } = useVisualizationTree({
    aggregateSizes,
    rootPath: "/",
    visualizationRoot: "/",
    focusedTopItems,
  });
  onRows(listRows);
  return null;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
