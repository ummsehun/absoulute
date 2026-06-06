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
import {
  CommandMacOsHelperEnumerator,
  MACOS_HELPER_ENUMERATE_BINARY_MISSING_REASON,
  type MacOsHelperEnumerator,
} from "./macosHelperEnumerateCommand";

export const MACOS_XPC_HELPER_NOT_IMPLEMENTED_REASON =
  "xpc-transport-not-implemented";

export interface MacOsXpcHelperTransportOptions {
  enumerateBinaryPath?: string;
  enumerator?: MacOsHelperEnumerator;
}

export class MacOsXpcHelperTransport implements HelperTransport {
  private readonly enumerator: MacOsHelperEnumerator | null;

  constructor(
    private readonly serviceManagementProbe: MacOsServiceManagementProbe =
      new NotImplementedMacOsServiceManagementProbe(),
    private readonly registrationPreflightInput: HelperRegistrationPreflightInput = {},
    options: MacOsXpcHelperTransportOptions = {},
  ) {
    this.enumerator = options.enumerator
      ?? (
        options.enumerateBinaryPath
          ? new CommandMacOsHelperEnumerator({
            commandPath: options.enumerateBinaryPath,
          })
          : null
      );
  }

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
      registrationPreflight,
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
    if (!this.enumerator) {
      throw new HelperTransportUnavailableError(
        MACOS_HELPER_ENUMERATE_BINARY_MISSING_REASON,
      );
    }

    try {
      await this.enumerator.enumerate(request, handlers);
    } catch (error) {
      throw new HelperTransportUnavailableError(
        error instanceof Error ? error.message : "helper-enumerate-failed",
      );
    }
  }
}
