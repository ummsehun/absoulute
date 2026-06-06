import type { HelperRequestEnvelope } from "../../../shared/schemas/helperProtocol";
import type { HelperClientStatus } from "./helperClient";
import {
  HelperTransportUnavailableError,
  type HelperTransport,
  type HelperTransportHandlers,
} from "./helperTransport";

export const MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON =
  "xpc-transport-not-implemented";

export class MacOsXpcHelperTransport implements HelperTransport {
  async getStatus(): Promise<HelperClientStatus> {
    return {
      available: false,
      reason: MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
      transport: "xpc",
    };
  }

  async getVersion(): Promise<string | null> {
    return null;
  }

  async healthCheck(): Promise<HelperClientStatus> {
    return await this.getStatus();
  }

  async enumerate(
    request: HelperRequestEnvelope,
    handlers: HelperTransportHandlers,
  ): Promise<void> {
    void request;
    void handlers;
    throw new HelperTransportUnavailableError(
      MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
    );
  }
}
