import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  HelperEventSchema,
  type HelperRequestEnvelope,
} from "../../../shared/schemas/helperProtocol";
import type { HelperTransportHandlers } from "./helperTransport";

export const HELPER_ENUMERATE_BIN_ENV = "SCAN_HELPER_ENUMERATE_BIN";
export const MACOS_HELPER_ENUMERATE_BINARY_NAME = "helper-enumerate-macos";
export const MACOS_HELPER_ENUMERATE_BINARY_MISSING_REASON =
  "helper-enumerate-binary-missing";

export interface MacOsHelperEnumerator {
  enumerate: (
    request: HelperRequestEnvelope,
    handlers: HelperTransportHandlers,
  ) => Promise<void>;
}

export interface CommandMacOsHelperEnumeratorRunRequest {
  commandPath: string;
  request: HelperRequestEnvelope;
  timeoutMs: number;
}

export interface CommandMacOsHelperEnumeratorRunResult {
  exitCode: number;
  stderr: string;
}

export type CommandMacOsHelperEnumeratorRunner = (
  request: CommandMacOsHelperEnumeratorRunRequest,
  handlers: HelperTransportHandlers,
) => Promise<CommandMacOsHelperEnumeratorRunResult>;

export interface CommandMacOsHelperEnumeratorOptions {
  commandPath: string;
  run?: CommandMacOsHelperEnumeratorRunner;
  timeoutMs?: number;
}

export class CommandMacOsHelperEnumerator implements MacOsHelperEnumerator {
  private readonly commandPath: string;
  private readonly replayedRequestKeys = new Set<string>();
  private readonly run: CommandMacOsHelperEnumeratorRunner;
  private readonly timeoutMs: number;

  constructor(options: CommandMacOsHelperEnumeratorOptions) {
    this.commandPath = options.commandPath;
    this.run = options.run ?? runCommandEnumerator;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async enumerate(
    request: HelperRequestEnvelope,
    handlers: HelperTransportHandlers,
  ): Promise<void> {
    const replayKey = buildReplayKey(request);
    if (this.replayedRequestKeys.has(replayKey)) {
      throw new Error("helper-enumerate-replayed-request");
    }
    this.replayedRequestKeys.add(replayKey);

    const result = await this.run(
      {
        commandPath: this.commandPath,
        request,
        timeoutMs: this.timeoutMs,
      },
      handlers,
    );

    if (result.exitCode !== 0) {
      throw new Error(buildFailedEnumeratorReason(result.exitCode, result.stderr));
    }
  }
}

function buildReplayKey(request: HelperRequestEnvelope): string {
  return `${request.scanId}\0${request.stageId}\0${request.nonce}`;
}

export function createMacOsHelperEnumeratorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  resourcesPath: string | null = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null,
): MacOsHelperEnumerator | null {
  if (platform !== "darwin") {
    return null;
  }

  const commandPath = resolveMacOsHelperEnumerateBinary(env, resourcesPath);
  return commandPath ? new CommandMacOsHelperEnumerator({ commandPath }) : null;
}

export function resolveMacOsHelperEnumerateBinary(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | null = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null,
): string | null {
  const envPath = env[HELPER_ENUMERATE_BIN_ENV]?.trim();
  if (envPath) {
    return envPath;
  }

  if (!resourcesPath) {
    return null;
  }

  const bundledCandidate = path.resolve(
    resourcesPath,
    "bin",
    MACOS_HELPER_ENUMERATE_BINARY_NAME,
  );
  return fs.existsSync(bundledCandidate) ? bundledCandidate : null;
}

function runCommandEnumerator(
  request: CommandMacOsHelperEnumeratorRunRequest,
  handlers: HelperTransportHandlers,
): Promise<CommandMacOsHelperEnumeratorRunResult> {
  return new Promise((resolve) => {
    const child = spawn(request.commandPath, [], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    let stdoutBuffer = "";
    let settled = false;
    let parseError: Error | null = null;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        resolve({
          exitCode: 1,
          stderr: "helper-enumerate-timeout",
        });
      }
    }, request.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (parseError) {
        return;
      }
      try {
        stdoutBuffer += chunk;
        stdoutBuffer = drainEventLines(stdoutBuffer, handlers);
      } catch (error) {
        parseError = error instanceof Error
          ? error
          : new Error("helper-enumerate-invalid-output");
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolve({
          exitCode: 1,
          stderr: error.message,
        });
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) {
        return;
      }

      try {
        if (parseError) {
          throw parseError;
        }
        drainFinalEventLine(stdoutBuffer, handlers);
        settled = true;
        resolve({
          exitCode: code ?? 1,
          stderr,
        });
      } catch (error) {
        settled = true;
        resolve({
          exitCode: 1,
          stderr: error instanceof Error ? error.message : "invalid-output",
        });
      }
    });
    child.stdin.end(`${JSON.stringify(request.request)}\n`);
  });
}

function drainEventLines(
  buffer: string,
  handlers: HelperTransportHandlers,
): string {
  const lines = buffer.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    parseAndDispatchEventLine(line, handlers);
  }
  return remainder;
}

function drainFinalEventLine(
  buffer: string,
  handlers: HelperTransportHandlers,
): void {
  const line = buffer.trim();
  if (line) {
    parseAndDispatchEventLine(line, handlers);
  }
}

function parseAndDispatchEventLine(
  line: string,
  handlers: HelperTransportHandlers,
): void {
  if (!line.trim()) {
    return;
  }
  handlers.onEvent(HelperEventSchema.parse(JSON.parse(line)));
}

function buildFailedEnumeratorReason(exitCode: number, stderr: string): string {
  const suffix = stderr.trim() || "no-stderr";
  return `helper-enumerate-failed:exit-${exitCode}:${suffix}`;
}
