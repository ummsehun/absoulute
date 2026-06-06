/* @vitest-environment node */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("package manager metadata", () => {
  it("pins pnpm so electron-builder does not fall back to bun dependency traversal", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as {
      packageManager?: string;
    };
    const hasPnpmLockfile = fs.existsSync(
      path.join(process.cwd(), "pnpm-lock.yaml"),
    );

    expect(hasPnpmLockfile).toBe(true);
    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });
});
