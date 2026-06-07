import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  HelperEventSchema,
  HelperRequestEnvelopeSchema,
  type HelperEvent,
  type HelperRequestEnvelope,
} from "../../../shared/schemas/helperProtocol";
import type { HelperTransportHandlers } from "./helperTransport";

export const HELPER_CONTROL_BIN_ENV = "SCAN_HELPER_CONTROL_BIN";
export const MACOS_HELPER_CONTROL_BINARY_NAME = "helper-control-macos";
export const MACOS_HELPER_CONTROL_BINARY_MISSING_REASON =
  "helper-control-binary-missing";

export interface MacOsHelperControlResult {
  helperVersion: string;
  peerValidation?: "listener-code-signing-requirement";
}

export interface MacOsHelperControlRequestInput {
  scanId: string;
  stageId: string;
  issuedAtMs?: number;
  nonce?: string;
  requestId?: string;
}

export interface MacOsHelperControl {
  healthCheck: (
    input: MacOsHelperControlRequestInput,
  ) => Promise<MacOsHelperControlResult>;
  getVersion: (input: MacOsHelperControlRequestInput) => Promise<string | null>;
}

export interface CommandMacOsHelperControlRunRequest {
  commandPath: string;
  request: HelperRequestEnvelope;
  timeoutMs: number;
}

export interface CommandMacOsHelperControlRunResult {
  exitCode: number;
  stderr: string;
}

export type CommandMacOsHelperControlRunner = (
  request: CommandMacOsHelperControlRunRequest,
  handlers: HelperTransportHandlers,
) => Promise<CommandMacOsHelperControlRunResult>;

export interface CommandMacOsHelperControlOptions {
  commandPath: string;
  run?: CommandMacOsHelperControlRunner;
  timeoutMs?: number;
}

export class CommandMacOsHelperControl implements MacOsHelperControl {
  private readonly commandPath: string;
  private readonly run: CommandMacOsHelperControlRunner;
  private readonly timeoutMs: number;

  constructor(options: CommandMacOsHelperControlOptions) {
    this.commandPath = options.commandPath;
    this.run = options.run ?? runCommandControl;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async healthCheck(
    input: MacOsHelperControlRequestInput,
  ): Promise<MacOsHelperControlResult> {
    return await this.runControlRequest(buildHelperControlRequest(input, "health.check"));
  }

  async getVersion(
    input: MacOsHelperControlRequestInput,
  ): Promise<string | null> {
    const result = await this.runControlRequest(
      buildHelperControlRequest(input, "version.get"),
    );
    return result.helperVersion;
  }

  async runControlRequest(
    request: HelperRequestEnvelope,
  ): Promise<MacOsHelperControlResult> {
    if (request.operation !== "health.check" && request.operation !== "version.get") {
      throw new Error(`helper-control-unsupported-operation:${request.operation}`);
    }

    let helperVersion: string | null = null;
    let peerValidation: MacOsHelperControlResult["peerValidation"];
    let terminalReceived = false;
    const boundHandlers = bindHandlersToRequest(request.requestId, {
      onEvent: (event) => {
        if (event.type === "ready") {
          helperVersion = event.helperVersion;
          peerValidation = event.peerValidation;
        }
        if (event.type === "done") {
          terminalReceived = true;
        }
        if (event.type === "error") {
          terminalReceived = true;
          throw new Error(`helper-control-error:${event.code}:${event.message}`);
        }
      },
    });
    const result = await this.run(
      {
        commandPath: this.commandPath,
        request,
        timeoutMs: this.timeoutMs,
      },
      boundHandlers,
    );

    if (result.exitCode !== 0) {
      throw new Error(buildFailedControlReason(result.exitCode, result.stderr));
    }
    if (!helperVersion) {
      throw new Error("helper-control-missing-ready");
    }
    if (!terminalReceived) {
      throw new Error("helper-control-missing-terminal");
    }

    return {
      helperVersion,
      ...(peerValidation ? { peerValidation } : {}),
    };
  }
}

function buildHelperControlRequest(
  input: MacOsHelperControlRequestInput,
  operation: "health.check" | "version.get",
): HelperRequestEnvelope {
  return HelperRequestEnvelopeSchema.parse({
    schemaVersion: 1,
    requestId: input.requestId ?? crypto.randomUUID(),
    scanId: input.scanId,
    stageId: input.stageId,
    operation,
    issuedAtMs: input.issuedAtMs ?? Date.now(),
    nonce: input.nonce ?? cryptoRandomNonce(),
    payload: {},
  });
}

function bindHandlersToRequest(
  requestId: string,
  handlers: HelperTransportHandlers,
): HelperTransportHandlers {
  let terminalReceived = false;

  return {
    onEvent: (event) => {
      const parsedEvent = HelperEventSchema.parse(event);
      if (parsedEvent.requestId !== requestId) {
        throw new Error("helper-control-request-id-mismatch");
      }
      if (terminalReceived) {
        throw new Error("helper-control-event-after-terminal");
      }
      if (parsedEvent.type === "done" || parsedEvent.type === "error") {
        terminalReceived = true;
      }
      assertControlEvent(parsedEvent);
      handlers.onEvent(parsedEvent);
    },
  };
}

function assertControlEvent(event: HelperEvent): void {
  if (event.type === "ready" || event.type === "done" || event.type === "error") {
    return;
  }
  throw new Error(`helper-control-unsupported-event:${event.type}`);
}

export function createMacOsHelperControlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  resourcesPath: string | null = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null,
): MacOsHelperControl | null {
  if (platform !== "darwin") {
    return null;
  }

  const commandPath = resolveMacOsHelperControlBinary(env, resourcesPath);
  return commandPath ? new CommandMacOsHelperControl({ commandPath }) : null;
}

export function resolveMacOsHelperControlBinary(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | null = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null,
): string | null {
  const envPath = env[HELPER_CONTROL_BIN_ENV]?.trim();
  if (envPath) {
    return envPath;
  }

  if (!resourcesPath) {
    return null;
  }

  const bundledCandidate = path.resolve(
    resourcesPath,
    "bin",
    MACOS_HELPER_CONTROL_BINARY_NAME,
  );
  return fs.existsSync(bundledCandidate) ? bundledCandidate : null;
}

function runCommandControl(
  request: CommandMacOsHelperControlRunRequest,
  handlers: HelperTransportHandlers,
): Promise<CommandMacOsHelperControlRunResult> {
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
          stderr: "helper-control-timeout",
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
          : new Error("helper-control-invalid-output");
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

function buildFailedControlReason(exitCode: number, stderr: string): string {
  const suffix = stderr.trim() || "no-stderr";
  return `helper-control-failed:exit-${exitCode}:${suffix}`;
}

function cryptoRandomNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}
