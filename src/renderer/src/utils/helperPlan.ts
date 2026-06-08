import type { ScanHelperPlan } from "../../../types/contracts";

export function getHelperPlanLabel(helperPlan?: ScanHelperPlan | null): string | null {
    if (!helperPlan) {
        return null;
    }

    const lifecycleState = helperPlan.lifecycle?.state ?? "unknown";
    const readiness = helperPlan.productionReadiness;
    const stage = helperPlan.stage ? `${helperPlan.stage} ` : "";
    if (helperPlan.engine === "helper") {
        return `helper ${stage}${readiness} ${helperPlan.transport} ${lifecycleState}`;
    }

    return [
        `helper ${stage}${readiness}`,
        ...formatHelperBlockers(helperPlan),
        `fallback ${helperPlan.fallbackReason ?? "native"} ${helperPlan.transport} ${lifecycleState}`,
    ].join(" ");
}

function formatHelperBlockers(helperPlan: ScanHelperPlan): string[] {
    const labels: string[] = [];
    if (helperPlan.registrationBlockers?.length) {
        labels.push(`registration:${formatBlockerCodes(helperPlan.registrationBlockers)}`);
    }
    if (helperPlan.readinessBlockers?.length) {
        labels.push(`readiness:${formatBlockerCodes(helperPlan.readinessBlockers)}`);
    }

    return labels;
}

function formatBlockerCodes(blockers: string[]): string {
    const [firstBlocker, ...remainingBlockers] = blockers;
    return remainingBlockers.length > 0
        ? `${firstBlocker},+${remainingBlockers.length}`
        : firstBlocker;
}
