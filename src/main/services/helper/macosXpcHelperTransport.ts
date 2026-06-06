import type { HelperRequestEnvelope } from "../../../shared/schemas/helperProtocol";
import type { HelperClientStatus } from "./helperClient";
import { createMacOsXpcLifecycle } from "./helperLifecycle";
import {
  NotImplementedMacOsServiceManagementProbe,
  type MacOsServiceManagementProbe,
} from "./macosServiceManagementProbe";
import {
  HelperTransportUnavailableError,
  type HelperTransport,
  type HelperTransportHandlers,
} from "./helperTransport";
import {
  resolveHelperRegistrationPreflight,
  type HelperRegistrationPreflightInput,
} from "./helperRegistration";

export const MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON =
  "xpc-transport-not-implemented";

export class MacOsXpcHelperTransport implements HelperTransport {
  constructor(
    private readonly serviceManagementProbe: MacOsServiceManagementProbe =
      new NotImplementedMacOsServiceManagementProbe(),
    private readonly registrationPreflightInput: HelperRegistrationPreflightInput = {},
  ) {}

  async getStatus(): Promise<HelperClientStatus> {
    const serviceManagement = await this.serviceManagementProbe.getStatus();
    const registrationPreflight = resolveHelperRegistrationPreflight(
      this.registrationPreflightInput,
    );
    const lifecycle = createMacOsXpcLifecycle({
      reason: MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON,
      registrationPreflight,
      serviceManagement,
    });

    return {
      available: false,
      lifecycle,
      reason: lifecycle.reason,
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
