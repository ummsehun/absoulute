import type {
  AppError,
  ScanCancelResult,
  ScanPauseResult,
  ScanProgressBatch,
  ScanResumeResult,
  ScanStartRequest,
  ScanStartResult,
} from "../../types/contracts";
import { DiskScanService } from "../services/diskScanService";
import { makeAppError, unknownToAppError } from "../utils/appError";

type ScanLifecycleState =
  | "IDLE"
  | "STARTING"
  | "RUNNING"
  | "PAUSED"
  | "FINALIZING"
  | "DONE"
  | "CANCELED"
  | "FAILED";

const ACTIVE_SCAN_STATES = new Set<ScanLifecycleState>([
  "STARTING",
  "RUNNING",
  "PAUSED",
  "FINALIZING",
]);

const TERMINAL_SCAN_STATES = new Set<ScanLifecycleState>([
  "DONE",
  "CANCELED",
  "FAILED",
]);

export class ScanManager {
  private readonly scanStates = new Map<string, ScanLifecycleState>();
  private starting = false;

  constructor(private readonly diskScanService: DiskScanService) {
    this.diskScanService.onProgress((batch) => {
      this.handleProgress(batch);
    });

    this.diskScanService.onError((error) => {
      this.handleError(error);
    });
  }

  async start(input: ScanStartRequest): Promise<ScanStartResult> {
    if (this.hasActiveScan()) {
      return {
        ok: false,
        error: this.makePhaseGateError(
          "start",
          null,
          "Only one active scan is allowed",
          ["IDLE", "DONE", "CANCELED", "FAILED"],
        ),
      };
    }

    this.starting = true;
    try {
      this.pruneTerminalStates();
      const data = await this.diskScanService.startScan(input);
      this.scanStates.set(data.scanId, "RUNNING");
      return { ok: true, data };
    } catch (error) {
      const appError = unknownToAppError(error);
      this.diskScanService.emitError(appError);
      return { ok: false, error: appError };
    } finally {
      this.starting = false;
    }
  }

  async cancel(scanId: string): Promise<ScanCancelResult> {
    const state = this.scanStates.get(scanId) ?? "IDLE";
    if (!["RUNNING", "PAUSED", "FINALIZING", "STARTING"].includes(state)) {
      return {
        ok: false,
        error: this.makePhaseGateError(
          "cancel",
          scanId,
          "Scan cannot be cancelled in current state",
          ["STARTING", "RUNNING", "PAUSED", "FINALIZING"],
          state,
        ),
      };
    }

    try {
      const cancelled = this.diskScanService.cancelScan(scanId);
      if (!cancelled) {
        return {
          ok: false,
          error: this.makePhaseGateError(
            "cancel",
            scanId,
            "Scan does not exist or already completed",
            ["STARTING", "RUNNING", "PAUSED", "FINALIZING"],
            state,
          ),
        };
      }

      this.scanStates.set(scanId, "CANCELED");
      return {
        ok: true,
        data: {
          ok: true,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: unknownToAppError(error),
      };
    }
  }

  async pause(scanId: string): Promise<ScanPauseResult> {
    const state = this.scanStates.get(scanId) ?? "IDLE";
    if (state !== "RUNNING") {
      return {
        ok: false,
        error: this.makePhaseGateError(
          "pause",
          scanId,
          "Scan can be paused only while running",
          ["RUNNING"],
          state,
        ),
      };
    }

    try {
      const response = this.diskScanService.pauseScan(scanId);
      if (!response.ok) {
        return {
          ok: false,
          error: this.makePhaseGateError(
            "pause",
            scanId,
            "Pause request was rejected",
            ["RUNNING"],
            state,
          ),
        };
      }

      this.scanStates.set(scanId, "PAUSED");
      return {
        ok: true,
        data: response,
      };
    } catch (error) {
      return {
        ok: false,
        error: unknownToAppError(error),
      };
    }
  }

  async resume(scanId: string): Promise<ScanResumeResult> {
    const state = this.scanStates.get(scanId) ?? "IDLE";
    if (state !== "PAUSED") {
      return {
        ok: false,
        error: this.makePhaseGateError(
          "resume",
          scanId,
          "Scan can be resumed only from paused state",
          ["PAUSED"],
          state,
        ),
      };
    }

    try {
      const response = this.diskScanService.resumeScan(scanId);
      if (!response.ok) {
        return {
          ok: false,
          error: this.makePhaseGateError(
            "resume",
            scanId,
            "Resume request was rejected",
            ["PAUSED"],
            state,
          ),
        };
      }

      this.scanStates.set(scanId, "RUNNING");
      return {
        ok: true,
        data: response,
      };
    } catch (error) {
      return {
        ok: false,
        error: unknownToAppError(error),
      };
    }
  }

  onProgress(listener: Parameters<DiskScanService["onProgress"]>[0]): () => void {
    return this.diskScanService.onProgress(listener);
  }

  onError(listener: (error: AppError) => void): () => void {
    return this.diskScanService.onError(listener);
  }

  private hasActiveScan(): boolean {
    if (this.starting) {
      return true;
    }

    for (const state of this.scanStates.values()) {
      if (ACTIVE_SCAN_STATES.has(state)) {
        return true;
      }
    }

    return false;
  }

  private handleProgress(batch: ScanProgressBatch): void {
    const scanId = batch.progress.scanId;
    const current = this.scanStates.get(scanId) ?? "IDLE";

    if (TERMINAL_SCAN_STATES.has(current)) {
      return;
    }

    switch (batch.progress.phase) {
      case "paused":
        this.scanStates.set(scanId, "PAUSED");
        return;
      case "walking":
        this.scanStates.set(scanId, "RUNNING");
        return;
      case "aggregating":
      case "compressing":
        this.scanStates.set(scanId, "FINALIZING");
        return;
      case "finalizing":
        this.scanStates.set(scanId, "FINALIZING");
        queueMicrotask(() => {
          const state = this.scanStates.get(scanId);
          if (state === "FINALIZING") {
            this.scanStates.set(scanId, "DONE");
          }
        });
        return;
      default:
        return;
    }
  }

  private handleError(error: AppError): void {
    const scanId = this.extractScanId(error);
    if (!scanId) {
      return;
    }

    if (error.code === "E_CANCELLED") {
      this.scanStates.set(scanId, "CANCELED");
      return;
    }

    if (!error.recoverable) {
      this.scanStates.set(scanId, "FAILED");
    }
  }

  private extractScanId(error: AppError): string | null {
    const raw = error.details?.scanId;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  }

  private pruneTerminalStates(limit = 200): void {
    if (this.scanStates.size < limit) {
      return;
    }

    for (const [scanId, state] of this.scanStates) {
      if (TERMINAL_SCAN_STATES.has(state)) {
        this.scanStates.delete(scanId);
      }

      if (this.scanStates.size < limit) {
        break;
      }
    }
  }

  private makePhaseGateError(
    operation: "start" | "pause" | "resume" | "cancel",
    scanId: string | null,
    message: string,
    allowedStates: ScanLifecycleState[],
    currentState?: ScanLifecycleState,
  ): AppError {
    return makeAppError("E_PHASE_GATE", message, true, {
      operation,
      scanId,
      currentState: currentState ?? "IDLE",
      allowedStates,
    });
  }
}
