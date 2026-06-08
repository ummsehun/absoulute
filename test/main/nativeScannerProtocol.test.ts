/* @vitest-environment node */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { describe, expect, it } from "vitest";

interface NativeMessage {
  type: string;
  items?: Array<{
    estimated?: boolean;
    path?: string;
    sizeDelta?: number;
  }>;
  blockedByPolicy?: number;
  code?: string;
  elapsedMs?: number;
  estimated?: boolean;
  permissionSamples?: string[];
  policySkipSamples?: string[];
  path?: string;
  targetPath?: string;
}

describe("native scanner protocol", () => {
  it("traverses responsive skip directories during exact deep scans", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-tests", "native-exact-"));
    const fixturePaths = [
      path.join(root, "node_modules", "pkg", "index.js"),
      path.join(root, ".git", "objects", "00", "object"),
      path.join(root, ".cache", "tool", "entry.bin"),
      path.join(root, "Example.app", "Contents", "Info.plist"),
    ];
    await Promise.all(
      fixturePaths.map(async (fixturePath) => {
        await fs.mkdir(path.dirname(fixturePath), { recursive: true });
        await fs.writeFile(fixturePath, "exact");
      }),
    );

    try {
      const messages = await runNativeScan({
        type: "start",
        scanId: "native-exact-fixture-test",
        root,
        mode: "deep",
        platform: process.platform,
        timeBudgetMs: 0,
        maxDepth: 16,
        sameDeviceOnly: true,
        concurrency: 16,
        accuracyMode: "full",
        deepPolicyPreset: "exact",
        elevationPolicy: "manual",
        emitPolicy: {
          aggBatchMaxItems: 64,
          aggBatchMaxMs: 20,
          progressIntervalMs: 80,
        },
        concurrencyPolicy: {
          min: 4,
          max: 16,
          adaptive: true,
        },
        skipBasenames: [],
        softSkipPathRules: [],
        softSkipPrefixes: [],
        skipDirSuffixes: [],
        blockedPrefixes: [],
        permissionPrefixes: [],
      });

      const emittedPaths = collectEmittedPaths(messages);
      const coverageEvents = messages.filter((message) => message.type === "coverage");
      const diagnosticsEvents = messages.filter((message) => message.type === "diagnostics");
      const done = messages.find((message) => message.type === "done");

      for (const fixturePath of fixturePaths) {
        expect(emittedPaths.has(fixturePath)).toBe(true);
      }
      expect(coverageEvents.every((event) => (event.blockedByPolicy ?? 0) === 0)).toBe(true);
      expect(diagnosticsEvents.every((event) => (event.policySkipSamples ?? []).length === 0))
        .toBe(true);
      expect(done?.estimated).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it("honors softSkipPathRules sent through stdin start messages", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-tests", "native-policy-"));
    const skippedRoot = path.join(root, "skip-me");
    await fs.mkdir(skippedRoot, { recursive: true });
    await fs.writeFile(path.join(skippedRoot, "file.txt"), "skipped");
    await fs.writeFile(path.join(root, "kept.txt"), "kept");

    try {
      const messages = await runNativeScan({
        type: "start",
        scanId: "native-policy-test",
        root,
        mode: "deep",
        platform: process.platform,
        timeBudgetMs: 0,
        maxDepth: 8,
        sameDeviceOnly: true,
        concurrency: 16,
        accuracyMode: "preview",
        deepPolicyPreset: "responsive",
        elevationPolicy: "manual",
        emitPolicy: {
          aggBatchMaxItems: 64,
          aggBatchMaxMs: 20,
          progressIntervalMs: 80,
        },
        concurrencyPolicy: {
          min: 4,
          max: 16,
          adaptive: true,
        },
        skipBasenames: [],
        softSkipPathRules: [{ all: ["/skip-me"] }],
        softSkipPrefixes: [],
        skipDirSuffixes: [],
        blockedPrefixes: [],
        permissionPrefixes: [],
      });

      const coverageEvents = messages.filter((message) => message.type === "coverage");
      const diagnosticsEvents = messages.filter((message) => message.type === "diagnostics");
      const done = messages.find((message) => message.type === "done");

      expect(coverageEvents.some((event) => (event.blockedByPolicy ?? 0) > 0)).toBe(true);
      expect(
        diagnosticsEvents.some((event) =>
          event.policySkipSamples?.includes(skippedRoot),
        ),
      ).toBe(true);
      expect(done?.estimated).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it("emits responsive skip directories as estimated aggregate items", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-tests", "native-estimate-"));
    const skippedRoot = path.join(root, "node_modules");
    await fs.mkdir(path.join(skippedRoot, "pkg"), { recursive: true });
    const directPayload = "direct payload".repeat(512);
    const nestedPayload = "nested payload".repeat(1024);
    await fs.writeFile(path.join(skippedRoot, "direct.bin"), directPayload);
    await fs.writeFile(path.join(skippedRoot, "pkg", "index.js"), nestedPayload);
    await fs.writeFile(path.join(root, "kept.txt"), "kept");

    try {
      const messages = await runNativeScan({
        type: "start",
        scanId: "native-estimate-policy-test",
        root,
        mode: "deep",
        platform: process.platform,
        timeBudgetMs: 0,
        maxDepth: 8,
        sameDeviceOnly: true,
        concurrency: 16,
        accuracyMode: "preview",
        deepPolicyPreset: "responsive",
        elevationPolicy: "manual",
        emitPolicy: {
          aggBatchMaxItems: 64,
          aggBatchMaxMs: 20,
          progressIntervalMs: 80,
        },
        concurrencyPolicy: {
          min: 4,
          max: 16,
          adaptive: true,
        },
        skipBasenames: ["node_modules"],
        softSkipPathRules: [],
        softSkipPrefixes: [],
        skipDirSuffixes: [],
        blockedPrefixes: [],
        permissionPrefixes: [],
      });

      const estimatedItems = collectAggItems(messages).filter((item) => item.estimated);

      expect(estimatedItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: skippedRoot,
            estimated: true,
          }),
        ]),
      );
      const estimatedNodeModules = estimatedItems.find((item) => item.path === skippedRoot);
      expect(estimatedNodeModules?.sizeDelta ?? 0).toBeGreaterThanOrEqual(
        Buffer.byteLength(directPayload) + Buffer.byteLength(nestedPayload),
      );
      expect(collectEmittedPaths(messages).has(path.join(skippedRoot, "pkg", "index.js")))
        .toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it("emits elevation_required when a directory read fails with permission denied", async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-tests", "native-permission-"));
    const deniedRoot = path.join(root, "denied");
    await fs.mkdir(deniedRoot, { recursive: true });
    await fs.writeFile(path.join(deniedRoot, "secret.txt"), "secret");
    await fs.chmod(deniedRoot, 0o000);

    try {
      const messages = await runNativeScan({
        type: "start",
        scanId: "native-permission-test",
        root,
        mode: "deep",
        platform: process.platform,
        timeBudgetMs: 0,
        maxDepth: 8,
        sameDeviceOnly: true,
        concurrency: 16,
        accuracyMode: "full",
        deepPolicyPreset: "exact",
        elevationPolicy: "manual",
        emitPolicy: {
          aggBatchMaxItems: 64,
          aggBatchMaxMs: 20,
          progressIntervalMs: 80,
        },
        concurrencyPolicy: {
          min: 4,
          max: 16,
          adaptive: true,
        },
        skipBasenames: [],
        softSkipPathRules: [],
        softSkipPrefixes: [],
        skipDirSuffixes: [],
        blockedPrefixes: [],
        permissionPrefixes: [],
      });

      const diagnosticsEvents = messages.filter((message) => message.type === "diagnostics");

      expect(messages.some((message) => message.type === "warn" && message.code === "E_PERMISSION"))
        .toBe(true);
      expect(messages.some((message) => message.type === "elevation_required")).toBe(true);
      expect(
        diagnosticsEvents.some((event) =>
          event.permissionSamples?.includes(deniedRoot),
        ),
      ).toBe(true);
    } finally {
      await fs.chmod(deniedRoot, 0o700).catch(() => undefined);
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});

async function runNativeScan(
  startPayload: Record<string, unknown>,
): Promise<NativeMessage[]> {
  const child = spawn(
    "cargo",
    ["run", "--manifest-path", "native/scanner/Cargo.toml", "--quiet"],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const messages: NativeMessage[] = [];
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const done = new Promise<void>((resolve, reject) => {
    lines.on("line", (line) => {
      const parsed = parseLine(line);
      if (!parsed) {
        return;
      }
      messages.push(parsed);
      if (parsed.type === "done") {
        resolve();
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`native scanner exited with ${String(code)}: ${stderr.trim()}`));
      }
    });
  });

  child.stdin.write(`${JSON.stringify(startPayload)}\n`);
  await done;
  child.stdin.end();
  lines.close();
  return messages;
}

function collectEmittedPaths(messages: NativeMessage[]): Set<string> {
  const paths = new Set<string>();
  for (const item of collectAggItems(messages)) {
    if (typeof item.path === "string") {
      paths.add(item.path);
    }
  }
  for (const message of messages) {
    if (typeof message.path === "string") {
      paths.add(message.path);
    }
  }
  return paths;
}

function collectAggItems(messages: NativeMessage[]): NonNullable<NativeMessage["items"]> {
  const items: NonNullable<NativeMessage["items"]> = [];
  for (const message of messages) {
    for (const item of message.items ?? []) {
      items.push(item);
    }
  }
  return items;
}

function parseLine(line: string): NativeMessage | null {
  try {
    const parsed = JSON.parse(line) as NativeMessage;
    return typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}
