import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type MacOsServiceManagementProbeState =
  | "not-implemented"
  | "not-installed"
  | "pending-approval"
  | "registered";

export interface MacOsServiceManagementProbeResult {
  state: MacOsServiceManagementProbeState;
  reason: string;
}

export interface MacOsServiceManagementProbe {
  getStatus: () => Promise<MacOsServiceManagementProbeResult>;
}

export interface MacOsServiceManagementControl
  extends MacOsServiceManagementProbe {
  register: () => Promise<MacOsServiceManagementProbeResult>;
  unregister: () => Promise<MacOsServiceManagementProbeResult>;
}

export interface HelperServiceManagementAudit {
  platform: NodeJS.Platform;
  probeBinaryPath: string | null;
  probeBinaryReady: boolean;
  serviceManagementReason: string;
  serviceManagementStatus: MacOsServiceManagementProbeState;
  status: "blocked" | "ready";
}

export interface BuildHelperServiceManagementAuditOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  probe?: MacOsServiceManagementProbe;
  probeBinaryPath?: string | null;
  resourcesPath?: string | null;
}

export const MACOS_SERVICE_MANAGEMENT_PROBE_NOT_IMPLEMENTED_REASON =
  "service-management-probe-not-implemented";
export const HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV =
  "SCAN_HELPER_SM_PROBE_BIN";
export const MACOS_SERVICE_MANAGEMENT_PROBE_BINARY_NAME =
  "service-management-probe-macos";
export const MACOS_SERVICE_MANAGEMENT_PROBE_TIMEOUT_MS = 10_000;

export interface CommandMacOsServiceManagementProbeRunRequest {
  commandPath: string;
  args: string[];
  timeoutMs: number;
}

export interface CommandMacOsServiceManagementProbeRunResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export type CommandMacOsServiceManagementProbeRunner = (
  request: CommandMacOsServiceManagementProbeRunRequest,
) => Promise<CommandMacOsServiceManagementProbeRunResult>;

export interface CommandMacOsServiceManagementProbeOptions {
  commandPath: string;
  args?: string[];
  run?: CommandMacOsServiceManagementProbeRunner;
  timeoutMs?: number;
}

export class NotImplementedMacOsServiceManagementProbe
  implements MacOsServiceManagementProbe
{
  async getStatus(): Promise<MacOsServiceManagementProbeResult> {
    return {
      state: "not-implemented",
      reason: MACOS_SERVICE_MANAGEMENT_PROBE_NOT_IMPLEMENTED_REASON,
    };
  }
}

export class CommandMacOsServiceManagementProbe
  implements MacOsServiceManagementProbe
{
  private readonly args: string[];
  private readonly commandPath: string;
  private readonly run: CommandMacOsServiceManagementProbeRunner;
  private readonly timeoutMs: number;

  constructor(options: CommandMacOsServiceManagementProbeOptions) {
    this.args = options.args ?? [];
    this.commandPath = options.commandPath;
    this.run = options.run ?? runCommandProbe;
    this.timeoutMs = options.timeoutMs
      ?? MACOS_SERVICE_MANAGEMENT_PROBE_TIMEOUT_MS;
  }

  async getStatus(): Promise<MacOsServiceManagementProbeResult> {
    const result = await this.run({
      commandPath: this.commandPath,
      args: this.args,
      timeoutMs: this.timeoutMs,
    });

    if (result.exitCode !== 0) {
      return {
        state: "not-implemented",
        reason: buildFailedProbeReason(result.exitCode, result.stderr),
      };
    }

    return parseProbeOutput(result.stdout);
  }
}

export class CommandMacOsServiceManagementController
  extends CommandMacOsServiceManagementProbe
  implements MacOsServiceManagementControl
{
  private readonly commandOptions: CommandMacOsServiceManagementProbeOptions;

  constructor(options: CommandMacOsServiceManagementProbeOptions) {
    super(options);
    this.commandOptions = options;
  }

  async register(): Promise<MacOsServiceManagementProbeResult> {
    const result = await new CommandMacOsServiceManagementProbe({
      ...this.commandOptions,
      args: ["register"],
    }).getStatus();
    return requireControlSuccessReason(result, "register");
  }

  async unregister(): Promise<MacOsServiceManagementProbeResult> {
    const result = await new CommandMacOsServiceManagementProbe({
      ...this.commandOptions,
      args: ["unregister"],
    }).getStatus();
    return requireControlSuccessReason(result, "unregister");
  }
}

export function createMacOsServiceManagementProbeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  resourcesPath: string | null = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null,
): MacOsServiceManagementProbe {
  if (platform !== "darwin") {
    return new NotImplementedMacOsServiceManagementProbe();
  }

  const commandPath = resolveMacOsServiceManagementProbeBinary(
    env,
    resourcesPath,
  );
  if (!commandPath) {
    return new NotImplementedMacOsServiceManagementProbe();
  }

  return new CommandMacOsServiceManagementProbe({ commandPath });
}

export function createMacOsServiceManagementControllerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  resourcesPath: string | null = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null,
): MacOsServiceManagementControl | null {
  if (platform !== "darwin") {
    return null;
  }

  const commandPath = resolveMacOsServiceManagementProbeBinary(
    env,
    resourcesPath,
  );
  if (!commandPath) {
    return null;
  }

  return new CommandMacOsServiceManagementController({ commandPath });
}

export function resolveMacOsServiceManagementProbeBinary(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | null = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null,
): string | null {
  const envPath = env[HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV]?.trim();
  if (envPath) {
    return hasExecutableFileEvidence(envPath) ? envPath : null;
  }

  if (!resourcesPath) {
    return null;
  }

  const bundledCandidate = path.resolve(
    resourcesPath,
    "bin",
    MACOS_SERVICE_MANAGEMENT_PROBE_BINARY_NAME,
  );
  return hasExecutableFileEvidence(bundledCandidate) ? bundledCandidate : null;
}

export async function buildHelperServiceManagementAudit(
  options: BuildHelperServiceManagementAuditOptions = {},
): Promise<HelperServiceManagementAudit> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const resourcesPath = options.resourcesPath
    ?? (typeof process.resourcesPath === "string" ? process.resourcesPath : null);
  const probeBinaryPath = options.probeBinaryPath
    ?? resolveMacOsServiceManagementProbeBinary(env, resourcesPath);
  const probeBinaryReady = probeBinaryPath !== null
    && hasExecutableFileEvidence(probeBinaryPath);
  const probe = options.probe
    ?? createMacOsServiceManagementProbeFromEnv(env, platform, resourcesPath);
  const result = await probe.getStatus();

  return {
    platform,
    probeBinaryPath,
    probeBinaryReady,
    serviceManagementReason: result.reason,
    serviceManagementStatus: result.state,
    status: result.state === "registered" ? "ready" : "blocked",
  };
}

function hasExecutableFileEvidence(candidatePath: string): boolean {
  try {
    const stat = fs.statSync(candidatePath);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function parseProbeOutput(output: string): MacOsServiceManagementProbeResult {
  try {
    const parsed = JSON.parse(output) as Partial<MacOsServiceManagementProbeResult>;
    if (isProbeState(parsed.state) && typeof parsed.reason === "string") {
      return {
        state: parsed.state,
        reason: parsed.reason,
      };
    }
  } catch {
    // Invalid probe output is handled below as an unavailable probe.
  }

  return {
    state: "not-implemented",
    reason: "service-management-probe-invalid-output",
  };
}

function isProbeState(value: unknown): value is MacOsServiceManagementProbeState {
  return value === "not-implemented"
    || value === "not-installed"
    || value === "pending-approval"
    || value === "registered";
}

function buildFailedProbeReason(exitCode: number, stderr: string): string {
  const suffix = stderr.trim() || "no-stderr";
  return `service-management-probe-failed:exit-${exitCode}:${suffix}`;
}

function requireControlSuccessReason(
  result: MacOsServiceManagementProbeResult,
  operation: "register" | "unregister",
): MacOsServiceManagementProbeResult {
  if (
    result.reason === `${operation}-succeeded`
    && isAllowedControlSuccessState(result.state, operation)
  ) {
    return result;
  }

  return {
    state: "not-implemented",
    reason: `service-management-control-output-mismatch:${operation}:${result.reason}`,
  };
}

function isAllowedControlSuccessState(
  state: MacOsServiceManagementProbeState,
  operation: "register" | "unregister",
): boolean {
  if (operation === "register") {
    return state === "registered" || state === "pending-approval";
  }

  return state === "not-installed";
}

function runCommandProbe(
  request: CommandMacOsServiceManagementProbeRunRequest,
): Promise<CommandMacOsServiceManagementProbeRunResult> {
  return new Promise((resolve) => {
    execFile(
      request.commandPath,
      request.args,
      { timeout: request.timeoutMs },
      (error, stdout, stderr) => {
        const exitCode = error
          ? typeof error.code === "number" ? error.code : 1
          : 0;
        resolve({
          exitCode,
          stdout,
          stderr: stderr || error?.message || "",
        });
      },
    );
  });
}
