/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  buildBreadcrumbPaths,
  getTopRootPath,
  isFilesystemRootPath,
  isSameOrChildPath,
  labelFromPath,
  normalizeFsPath,
  parentPathOf,
} from "../../src/renderer/src/utils/pathUtils";

describe("renderer path utils", () => {
  it("normalizes POSIX and Windows-like filesystem paths", () => {
    expect(normalizeFsPath(" /Users/tester// ")).toBe("/Users/tester");
    expect(normalizeFsPath("C:\\Users\\tester\\")).toBe("c:/Users/tester");
    expect(normalizeFsPath("D:")).toBe("d:/");
  });

  it("normalizes macOS Data volume aliases to visible filesystem paths", () => {
    expect(normalizeFsPath("/System/Volumes/Data/Users/user")).toBe("/Users/user");
    expect(normalizeFsPath("/System/Volumes/Data/Applications/App.app")).toBe(
      "/Applications/App.app",
    );
  });

  it("derives parent, root, labels, and child relationships", () => {
    expect(parentPathOf("/Users/tester/project")).toBe("/Users/tester");
    expect(parentPathOf("/Users")).toBe("/");
    expect(parentPathOf("/")).toBeNull();
    expect(getTopRootPath("C:/Users/tester")).toBe("c:/");
    expect(getTopRootPath("/Users/tester")).toBe("/");
    expect(labelFromPath("/Users/tester/project")).toBe("project");
    expect(isFilesystemRootPath("/")).toBe(true);
    expect(isSameOrChildPath("/Users/tester/project", "/Users/tester")).toBe(true);
    expect(isSameOrChildPath("/Users/tester2", "/Users/tester")).toBe(false);
  });

  it("builds breadcrumbs only inside the base path", () => {
    expect(buildBreadcrumbPaths("/Users", "/Users/tester/project")).toEqual([
      "/Users",
      "/Users/tester",
      "/Users/tester/project",
    ]);
    expect(buildBreadcrumbPaths("/Applications", "/Users/tester")).toEqual([]);
  });
});
