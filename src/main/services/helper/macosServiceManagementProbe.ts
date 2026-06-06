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
