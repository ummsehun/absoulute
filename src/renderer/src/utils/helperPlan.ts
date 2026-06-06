import type { ScanHelperPlan } from "../../../types/contracts";

export function getHelperPlanLabel(helperPlan?: ScanHelperPlan | null): string | null {
    if (!helperPlan) {
        return null;
    }

    const lifecycleState = helperPlan.lifecycle?.state ?? "unknown";
    if (helperPlan.engine === "helper") {
        return `helper ${helperPlan.transport} ${lifecycleState}`;
    }

    return `helper fallback ${helperPlan.fallbackReason ?? "native"} ${helperPlan.transport} ${lifecycleState}`;
}
