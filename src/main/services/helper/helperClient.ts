import crypto from "node:crypto";
import type { NativeVolumePlan } from "../scan/nativeScanOrchestrator";
import type { ResolvedScanOptions } from "../scan/scanRuntimeOptions";
import {
  HelperRequestEnvelopeSchema,
  type HelperEvent,
  type HelperRequestEnvelope,
} from "../../../shared/schemas/helperProtocol";
import type { HelperLifecycleStatus } from "./helperLifecycle";
import {
  DisabledHelperTransport,
  HelperTransportUnavailableError,
  type HelperTransport,
} from "./helperTransport";
import { resolveHelperRegistrationPreflightInputFromEnv } from "./helperRegistration";
import { MacOsXpcHelperTransport } from "./macosXpcHelperTransport";

export const HELPER_DISABLED_REASON = "helper-phase-gate-unresolved";
export const HELPER_TRANSPORT_ENV = "SCAN_HELPER_TRANSPORT";

export interface HelperClientStatus {
  available: boolean;
  lifecycle?: HelperLifecycleStatus;
  reason?: string;
  transport: "disabled" | "xpc";
}

export interface HelperEnumerateInput {
  rootPath: string;
  scanId: string;
  stageId: string;
  scanMode: "quick" | "deep";
  options: Pick<
    ResolvedScanOptions,
    "accuracyMode" | "emitPolicy" | "deepPolicyPreset"
  >;
  volumePlan: NativeVolumePlan;
  maxDepth: number;
  issuedAtMs?: number;
  nonce?: string;
  requestId?: string;
  traversalPolicyPlanId?: string;
}

export interface HelperEnumerateHandlers {
  onEvent: (event: HelperEvent) => void;
}

export interface HelperClient {
  getStatus: () => Promise<HelperClientStatus>;
  getVersion: () => Promise<string | null>;
  healthCheck: () => Promise<HelperClientStatus>;
  enumerate: (
    input: HelperEnumerateInput,
    handlers: HelperEnumerateHandlers,
  ) => Promise<void>;
}

export class HelperUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Privileged helper is unavailable: ${reason}`);
    this.name = "HelperUnavailableError";
  }
}

export class TransportHelperClient implements HelperClient {
  constructor(private readonly transport: HelperTransport) {}

  async getStatus(): Promise<HelperClientStatus> {
    return await this.transport.getStatus();
  }

  async getVersion(): Promise<string | null> {
    return await this.transport.getVersion();
  }

  async healthCheck(): Promise<HelperClientStatus> {
    return await this.transport.healthCheck();
  }

  async enumerate(
    input: HelperEnumerateInput,
    handlers: HelperEnumerateHandlers,
  ): Promise<void> {
    const request = buildHelperEnumerateRequest(input);
    try {
      await this.transport.enumerate(request, handlers);
    } catch (error) {
      if (error instanceof HelperTransportUnavailableError) {
        throw new HelperUnavailableError(error.reason);
      }
      throw error;
    }
  }
}

export class DisabledHelperClient extends TransportHelperClient {
  constructor(reason = HELPER_DISABLED_REASON) {
    super(new DisabledHelperTransport(reason));
  }
}

export function createDefaultHelperClient(): HelperClient {
  return new TransportHelperClient(createDefaultHelperTransport());
}

export function createDefaultHelperTransport(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): HelperTransport {
  if (env[HELPER_TRANSPORT_ENV] !== "xpc") {
    return new DisabledHelperTransport(HELPER_DISABLED_REASON);
  }

  if (platform !== "darwin") {
    return new DisabledHelperTransport("xpc-transport-non-darwin");
  }

  return new MacOsXpcHelperTransport(
    undefined,
    resolveHelperRegistrationPreflightInputFromEnv(env),
  );
}

export function buildHelperEnumerateRequest(
  input: HelperEnumerateInput,
): HelperRequestEnvelope {
  const request = {
    schemaVersion: 1,
    requestId: input.requestId ?? crypto.randomUUID(),
    scanId: input.scanId,
    stageId: input.stageId,
    operation: "scan.enumerate",
    issuedAtMs: input.issuedAtMs ?? Date.now(),
    nonce: input.nonce ?? crypto.randomBytes(16).toString("hex"),
    payload: {
      root: input.rootPath,
      scanMode: input.scanMode,
      accuracyMode: input.options.accuracyMode,
      volumePolicy: input.volumePlan.volumePolicy,
      plannedRoots: input.volumePlan.plannedRoots,
      maxDepth: input.maxDepth,
      sameDeviceOnly: input.volumePlan.sameDeviceOnly,
      permissionPolicy: "report-only",
      traversalPolicyPlanId: input.traversalPolicyPlanId
        ?? `${input.scanId}:${input.stageId}:${input.options.deepPolicyPreset}`,
      emitPolicy: {
        batchMaxItems: input.options.emitPolicy.aggBatchMaxItems,
        progressIntervalMs: input.options.emitPolicy.progressIntervalMs,
      },
    },
  };

  return HelperRequestEnvelopeSchema.parse(request);
}
