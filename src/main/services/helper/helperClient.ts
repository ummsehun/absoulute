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
import {
  resolveHelperRegistrationPreflight,
  resolveHelperRegistrationPreflightInputFromEnv,
  type HelperRegistrationPreflight,
} from "./helperRegistration";
import { createMacOsHelperEnumeratorFromEnv } from "./macosHelperEnumerateCommand";
import {
  createMacOsServiceManagementControllerFromEnv,
  createMacOsServiceManagementProbeFromEnv,
} from "./macosServiceManagementProbe";
import { MacOsXpcHelperTransport } from "./macosXpcHelperTransport";
import { createMacOsHelperControlFromEnv } from "./macosHelperControlCommand";

export const HELPER_DISABLED_REASON = "helper-phase-gate-unresolved";
export const HELPER_TRANSPORT_ENV = "SCAN_HELPER_TRANSPORT";
export const HELPER_PROTOTYPE_ENUMERATE_ENV =
  "SCAN_HELPER_PROTOTYPE_ENUMERATE";

export interface HelperClientStatus {
  available: boolean;
  lifecycle?: HelperLifecycleStatus;
  registrationPreflight?: HelperRegistrationPreflight;
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

export interface HelperControlRequestInput {
  scanId: string;
  stageId: string;
  issuedAtMs?: number;
  nonce?: string;
  requestId?: string;
}

export interface HelperEnumerateHandlers {
  onEvent: (event: HelperEvent) => void;
}

export interface HelperClient {
  getStatus: () => Promise<HelperClientStatus>;
  getVersion: () => Promise<string | null>;
  healthCheck: () => Promise<HelperClientStatus>;
  register: () => Promise<HelperClientStatus>;
  unregister: () => Promise<HelperClientStatus>;
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

  async register(): Promise<HelperClientStatus> {
    try {
      return await this.transport.register();
    } catch (error) {
      if (error instanceof HelperTransportUnavailableError) {
        throw new HelperUnavailableError(error.reason);
      }
      throw error;
    }
  }

  async unregister(): Promise<HelperClientStatus> {
    try {
      return await this.transport.unregister();
    } catch (error) {
      if (error instanceof HelperTransportUnavailableError) {
        throw new HelperUnavailableError(error.reason);
      }
      throw error;
    }
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
  resourcesPath: string | null = typeof process.resourcesPath === "string"
    ? process.resourcesPath
    : null,
  projectRoot = process.cwd(),
): HelperTransport {
  const registrationPreflightInput =
    resolveHelperRegistrationPreflightInputFromEnv(env, projectRoot);
  const explicitXpcTransport = env[HELPER_TRANSPORT_ENV] === "xpc";
  const readinessGatedXpcTransport = platform === "darwin"
    && resolveHelperRegistrationPreflight(registrationPreflightInput).status
      === "ready";

  if (!explicitXpcTransport && !readinessGatedXpcTransport) {
    return new DisabledHelperTransport(HELPER_DISABLED_REASON);
  }

  if (platform !== "darwin") {
    return new DisabledHelperTransport("xpc-transport-non-darwin");
  }

  return new MacOsXpcHelperTransport(
    createMacOsServiceManagementProbeFromEnv(env, platform, resourcesPath),
    registrationPreflightInput,
    {
      allowPrototypeEnumerate: readBooleanEnv(
        env[HELPER_PROTOTYPE_ENUMERATE_ENV],
      ),
      control: createMacOsHelperControlFromEnv(env, platform, resourcesPath)
        ?? undefined,
      enumerator: createMacOsHelperEnumeratorFromEnv(
        env,
        platform,
        resourcesPath,
      ) ?? undefined,
      serviceManagementControl: createMacOsServiceManagementControllerFromEnv(
        env,
        platform,
        resourcesPath,
      ) ?? undefined,
    },
  );
}

export function buildHelperEnumerateRequest(
  input: HelperEnumerateInput,
): HelperRequestEnvelope {
  const request = {
    ...buildBaseHelperRequestEnvelope(input),
    operation: "scan.enumerate",
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

export function buildHelperHealthCheckRequest(
  input: HelperControlRequestInput,
): HelperRequestEnvelope {
  return HelperRequestEnvelopeSchema.parse({
    ...buildBaseHelperRequestEnvelope(input),
    operation: "health.check",
    payload: {},
  });
}

export function buildHelperVersionGetRequest(
  input: HelperControlRequestInput,
): HelperRequestEnvelope {
  return HelperRequestEnvelopeSchema.parse({
    ...buildBaseHelperRequestEnvelope(input),
    operation: "version.get",
    payload: {},
  });
}

function buildBaseHelperRequestEnvelope(input: HelperControlRequestInput) {
  return {
    schemaVersion: 1,
    requestId: input.requestId ?? crypto.randomUUID(),
    scanId: input.scanId,
    stageId: input.stageId,
    issuedAtMs: input.issuedAtMs ?? Date.now(),
    nonce: input.nonce ?? crypto.randomBytes(16).toString("hex"),
  } as const;
}

function readBooleanEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
