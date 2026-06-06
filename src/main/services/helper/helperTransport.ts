import type {
  HelperEvent,
  HelperRequestEnvelope,
} from "../../../shared/schemas/helperProtocol";
import type { HelperClientStatus } from "./helperClient";
import { createDisabledHelperLifecycle } from "./helperLifecycle";

export interface HelperTransportHandlers {
  onEvent: (event: HelperEvent) => void;
}

export interface HelperTransport {
  getStatus: () => Promise<HelperClientStatus>;
  getVersion: () => Promise<string | null>;
  healthCheck: () => Promise<HelperClientStatus>;
  register: () => Promise<HelperClientStatus>;
  unregister: () => Promise<HelperClientStatus>;
  enumerate: (
    request: HelperRequestEnvelope,
    handlers: HelperTransportHandlers,
  ) => Promise<void>;
}

export class HelperTransportUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Privileged helper transport is unavailable: ${reason}`);
    this.name = "HelperTransportUnavailableError";
  }
}

export class DisabledHelperTransport implements HelperTransport {
  constructor(private readonly reason: string) {}

  async getStatus(): Promise<HelperClientStatus> {
    return {
      available: false,
      lifecycle: createDisabledHelperLifecycle(this.reason),
      reason: this.reason,
      transport: "disabled",
    };
  }

  async getVersion(): Promise<string | null> {
    return null;
  }

  async healthCheck(): Promise<HelperClientStatus> {
    return await this.getStatus();
  }

  async register(): Promise<HelperClientStatus> {
    throw new HelperTransportUnavailableError(this.reason);
  }

  async unregister(): Promise<HelperClientStatus> {
    throw new HelperTransportUnavailableError(this.reason);
  }

  async enumerate(
    request: HelperRequestEnvelope,
    handlers: HelperTransportHandlers,
  ): Promise<void> {
    void request;
    void handlers;
    throw new HelperTransportUnavailableError(this.reason);
  }
}
