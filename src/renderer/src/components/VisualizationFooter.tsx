import React from 'react';
import { formatBytes, formatCount } from '../utils/helpers';
import { Button } from './ui/button';

interface VisualizationFooterProps {
    selectedCount: number;
    selectedSize: number;
    blockedByPermission: number;
    skippedByScope: number;
    nonRemovableVisible: number;
    clearSelection: () => void;
}

export function VisualizationFooter({
    selectedCount,
    selectedSize,
    blockedByPermission,
    skippedByScope,
    nonRemovableVisible,
    clearSelection,
}: VisualizationFooterProps) {
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
            </div>

            <div className="flex items-center gap-3">
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
