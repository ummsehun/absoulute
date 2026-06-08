import React from 'react';
import type { ScanHelperPlan } from '../../../types/contracts';
import { formatBytes, formatCount } from '../utils/helpers';
import { getHelperPlanLabel } from '../utils/helperPlan';
import type { ScanAccessStatus } from '../utils/scanAccessStatus';
import { Button } from './ui/button';

interface VisualizationFooterProps {
    selectedCount: number;
    selectedSize: number;
    blockedByPermission: number;
    skippedByScope: number;
    nonRemovableVisible: number;
    helperPlan?: ScanHelperPlan | null;
    accessStatus?: ScanAccessStatus | null;
    clearSelection: () => void;
    onExactRecheck?: () => void | Promise<void>;
}

export function VisualizationFooter({
    selectedCount,
    selectedSize,
    blockedByPermission,
    skippedByScope,
    nonRemovableVisible,
    helperPlan,
    accessStatus,
    clearSelection,
    onExactRecheck,
}: VisualizationFooterProps) {
    const helperPlanLabel = getHelperPlanLabel(helperPlan);

    return (
        <footer className="flex shrink-0 h-[68px] items-center justify-between gap-4 border-t border-white/10 px-6 text-white/84 bg-black/20 backdrop-blur-md">
            <div className="text-[15px] font-medium">
                {selectedCount > 0 ? `${formatCount(selectedCount)} items selected` : 'No items selected'}
                <span className="mx-3 text-white/26">|</span>
                {formatBytes(selectedSize)}
                <span className="mx-3 text-white/26">|</span>
                {formatCount(blockedByPermission)} permission
                <span className="mx-2 text-white/26">|</span>
                {formatCount(skippedByScope)} scope
                <span className="mx-2 text-white/26">|</span>
                {formatCount(nonRemovableVisible)} protected system
                {helperPlanLabel ? (
                    <>
                        <span className="mx-2 text-white/26">|</span>
                        <span className="inline-block max-w-[260px] truncate align-bottom">
                            {helperPlanLabel}
                        </span>
                    </>
                ) : null}
                {accessStatus ? (
                    <>
                        <span className="mx-2 text-white/26">|</span>
                        <span className="inline-block max-w-[360px] truncate align-bottom text-amber-100">
                            {accessStatus.title}: {accessStatus.detail}
                        </span>
                    </>
                ) : null}
            </div>

            <div className="flex items-center gap-3">
                {onExactRecheck ? (
                    <Button
                        variant="outline"
                        onClick={() => {
                            void onExactRecheck();
                        }}
                        className="rounded-full border border-cyan-200/24 bg-cyan-300/10 px-5 py-3 text-base font-semibold text-cyan-50 transition hover:bg-cyan-300/18 hover:text-white"
                    >
                        Exact Recheck
                    </Button>
                ) : null}
                <Button
                    variant="outline"
                    onClick={clearSelection}
                    className="rounded-full border border-white/12 bg-white/6 px-5 py-3 text-base font-semibold text-white/82 transition hover:bg-white/12 hover:text-white"
                >
                    Clear Selection
                </Button>
                <Button
                    variant="gradient"
                    disabled={selectedCount === 0}
                    className="rounded-full px-7 py-3 text-base font-semibold"
                >
                    Review and Remove
                </Button>
            </div>
        </footer>
    );
}
