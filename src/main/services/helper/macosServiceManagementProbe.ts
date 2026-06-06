import { execFile } from "node:child_process";

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

export const MACOS_SERVICE_MANAGEMENT_PROBE_NOT_IMPLEMENTED_REASON =
  "service-management-probe-not-implemented";
export const HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV =
  "SCAN_HELPER_SM_PROBE_BIN";

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
    this.timeoutMs = options.timeoutMs ?? 2_000;
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

export function createMacOsServiceManagementProbeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): MacOsServiceManagementProbe {
  const commandPath = env[HELPER_SERVICE_MANAGEMENT_PROBE_BIN_ENV]?.trim();
  if (platform !== "darwin" || !commandPath) {
    return new NotImplementedMacOsServiceManagementProbe();
  }

  return new CommandMacOsServiceManagementProbe({ commandPath });
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
