import type { ScanHelperPlan } from "../../../types/contracts";

export function getHelperPlanLabel(helperPlan?: ScanHelperPlan | null): string | null {
    if (!helperPlan) {
        return null;
    }

    const lifecycleState = helperPlan.lifecycle?.state ?? "unknown";
    const readiness = helperPlan.productionReadiness;
    if (helperPlan.engine === "helper") {
        return `helper ${readiness} ${helperPlan.transport} ${lifecycleState}`;
    }

    return `helper ${readiness} fallback ${helperPlan.fallbackReason ?? "native"} ${helperPlan.transport} ${lifecycleState}`;
}
