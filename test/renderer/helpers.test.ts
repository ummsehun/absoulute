/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { pruneAggregateStateInPlace } from "../../src/renderer/src/utils/helpers";

describe("renderer helpers", () => {
  it("keeps immediate children of filesystem roots when pruning large aggregate maps", () => {
    const aggregateSizes: Record<string, number> = {
      "/": 1024,
      "/Applications": 128,
      "/Users": 768,
      "/Library": 256,
    };

    for (let index = 0; index < 4500; index += 1) {
      aggregateSizes[`/Users/test/project-${index}`] = 1;
    }

    const beforeCount = Object.keys(aggregateSizes).length;
    pruneAggregateStateInPlace(aggregateSizes, "/", "/");

    expect(Object.keys(aggregateSizes).length).toBeLessThan(beforeCount);
    expect(aggregateSizes["/Applications"]).toBe(128);
    expect(aggregateSizes["/Users"]).toBe(768);
    expect(aggregateSizes["/Library"]).toBe(256);
  });
});
