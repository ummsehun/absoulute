/* @vitest-environment node */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenImportPatterns = [
  /from\s+["'][^"']*src\/main[^"']*["']/,
  /from\s+["'][^"']*src\/renderer[^"']*["']/,
  /from\s+["'](?:\.\.\/)+(?:main|renderer)(?:\/|["'])/,
  /from\s+["'][^"']*electron[^"']*["']/,
  /from\s+["']electron["']/,
  /from\s+["']node:fs["']/,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:os["']/,
  /process\.env/,
  /ipcMain/,
  /BrowserWindow/,
];

describe("shared boundary", () => {
  it("flags direct and relative imports from main or renderer modules", () => {
    expect(findForbiddenSharedBoundaryImports("import x from '../../main/service';"))
      .toHaveLength(1);
    expect(findForbiddenSharedBoundaryImports("import x from '../renderer/hook';"))
      .toHaveLength(1);
    expect(findForbiddenSharedBoundaryImports("import x from '../../shared/schemas/scan';"))
      .toHaveLength(0);
  });

  it("keeps shared modules free of Electron, main, renderer, and side-effectful runtime imports", () => {
    const sharedFiles = collectSourceFiles(path.join(process.cwd(), "src", "shared"));
    const violations = sharedFiles.flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return findForbiddenSharedBoundaryImports(source)
        .map((pattern) => `${path.relative(process.cwd(), filePath)} violates ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});

function findForbiddenSharedBoundaryImports(source: string): RegExp[] {
  return forbiddenImportPatterns.filter((pattern) => pattern.test(source));
}

function collectSourceFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}
