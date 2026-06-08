/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { ScanAggregator } from "../../src/main/services/scanAggregator";

describe("ScanAggregator estimate convergence", () => {
  it("treats filesystem root children as within the scan root", () => {
    const aggregator = new ScanAggregator("/", 200, "darwin");

    const deltas = aggregator.addDirectoryEstimate("/Users", 60 * 1024 ** 3);

    expect(deltas.some((delta) => delta.nodePath === "/Users")).toBe(true);
    expect(deltas.some((delta) => delta.nodePath === "/")).toBe(true);
    expect(aggregator.getDirectorySize("/Users")).toBe(60 * 1024 ** 3);
    expect(aggregator.getDirectorySize("/")).toBe(60 * 1024 ** 3);
  });

  it("removes directory estimates before exact file sizes are applied", () => {
    const rootPath = "/Users/tester";
    const targetDir = "/Users/tester/Library/Caches";
    const filePath = "/Users/tester/Library/Caches/archive.bin";
    const aggregator = new ScanAggregator(rootPath, 200, "darwin");

    aggregator.ensureDirectory("/Users/tester/Library", rootPath);
    aggregator.ensureDirectory(targetDir, "/Users/tester/Library");

    aggregator.addDirectoryEstimate(targetDir, 1_024);
    expect(aggregator.getDirectorySize(targetDir)).toBe(1_024);
    expect(aggregator.getDirectorySize(rootPath)).toBe(1_024);

    const cleared = aggregator.clearEstimatedAncestors(filePath);
    expect(cleared.cleared).toEqual([targetDir]);
    expect(cleared.deltas.some((delta) => delta.nodePath === targetDir && delta.sizeDelta === -1_024)).toBe(true);
    expect(aggregator.getDirectorySize(targetDir)).toBe(0);
    expect(aggregator.getDirectorySize(rootPath)).toBe(0);

    aggregator.addFile(filePath, 256);
    expect(aggregator.getDirectorySize(targetDir)).toBe(256);
    expect(aggregator.getDirectorySize(rootPath)).toBe(256);
  });
});
