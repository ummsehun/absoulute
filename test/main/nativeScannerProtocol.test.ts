/* @vitest-environment node */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { describe, expect, it } from "vitest";

interface NativeMessage {
  type: string;
  blockedByPolicy?: number;
  code?: string;
  elapsedMs?: number;
  estimated?: boolean;
  policySkipSamples?: string[];
  targetPath?: string;
}

describe("native scanner protocol", () => {
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

      expect(messages.some((message) => message.type === "warn" && message.code === "E_PERMISSION"))
        .toBe(true);
      expect(messages.some((message) => message.type === "elevation_required")).toBe(true);
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

function parseLine(line: string): NativeMessage | null {
  try {
    const parsed = JSON.parse(line) as NativeMessage;
    return typeof parsed.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}
