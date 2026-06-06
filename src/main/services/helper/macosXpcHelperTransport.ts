import type { HelperRequestEnvelope } from "../../../shared/schemas/helperProtocol";
import type { HelperClientStatus } from "./helperClient";
import { createMacOsXpcLifecycle } from "./helperLifecycle";
import {
  NotImplementedMacOsServiceManagementProbe,
  type MacOsServiceManagementControl,
  type MacOsServiceManagementProbe,
  type MacOsServiceManagementProbeResult,
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
  allowPrototypeEnumerate?: boolean;
  enumerateBinaryPath?: string;
  enumerator?: MacOsHelperEnumerator;
  serviceManagementControl?: MacOsServiceManagementControl;
}

export class MacOsXpcHelperTransport implements HelperTransport {
  private readonly allowPrototypeEnumerate: boolean;
  private readonly enumerator: MacOsHelperEnumerator | null;
  private readonly serviceManagementControl: MacOsServiceManagementControl | null;

  constructor(
    private readonly serviceManagementProbe: MacOsServiceManagementProbe =
      new NotImplementedMacOsServiceManagementProbe(),
    private readonly registrationPreflightInput: HelperRegistrationPreflightInput = {},
    options: MacOsXpcHelperTransportOptions = {},
  ) {
    this.allowPrototypeEnumerate = options.allowPrototypeEnumerate === true;
    this.serviceManagementControl = options.serviceManagementControl ?? null;
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

  async register(): Promise<HelperClientStatus> {
    this.assertInstallPreflightReady();
    if (!this.serviceManagementControl) {
      throw new HelperTransportUnavailableError(
        "service-management-control-unavailable",
      );
    }

    return this.statusFromServiceManagementResult(
      await this.serviceManagementControl.register(),
    );
  }

  async unregister(): Promise<HelperClientStatus> {
    if (!this.serviceManagementControl) {
      throw new HelperTransportUnavailableError(
        "service-management-control-unavailable",
      );
    }

    return this.statusFromServiceManagementResult(
      await this.serviceManagementControl.unregister(),
    );
  }

  async enumerate(
    request: HelperRequestEnvelope,
    handlers: HelperTransportHandlers,
  ): Promise<void> {
    const registrationPreflight = resolveHelperRegistrationPreflight(
      this.registrationPreflightInput,
    );
    if (
      registrationPreflight.status !== "ready"
      && !this.allowPrototypeEnumerate
    ) {
      throw new HelperTransportUnavailableError(
        `registration-preflight-blocked:${registrationPreflight.blockers.join(",")}`,
      );
    }

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

  private assertInstallPreflightReady(): void {
    const registrationPreflight = resolveHelperRegistrationPreflight(
      this.registrationPreflightInput,
    );
    const installBlockers = registrationPreflight.blockers.filter(
      (blocker) => blocker !== "fda-validation-matrix-missing",
    );

    if (installBlockers.length > 0) {
      throw new HelperTransportUnavailableError(
        `registration-install-preflight-blocked:${installBlockers.join(",")}`,
      );
    }
  }

  private statusFromServiceManagementResult(
    serviceManagement: MacOsServiceManagementProbeResult,
  ): HelperClientStatus {
    const registrationPreflight = resolveHelperRegistrationPreflight(
      this.registrationPreflightInput,
    );
    const lifecycle = createMacOsXpcLifecycle({
      reason: serviceManagement.reason,
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
}
