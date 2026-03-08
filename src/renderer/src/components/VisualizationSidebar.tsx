import React from 'react';
import { formatBytes, formatCount, labelFromPath } from '../utils/helpers';
import { FolderGlyph } from './icons';
import { SidebarList, type SidebarListProps } from './SidebarList';
import { Progress } from './ui/progress';
import { Button } from './ui/button';

interface VisualizationSidebarProps extends SidebarListProps {
    rootPath: string;
    visualizationRoot: string;
    displayVisualizationSize: number;
    displayScanRootSize: number;
    scopePercent: number;
    scannedCount: number;
    completenessNote: string;
    allVisibleSelected: boolean;
    filesPerSec: number;
    toggleSelectAll: () => void;
}

export function VisualizationSidebar({
    rootPath,
    visualizationRoot,
    displayVisualizationSize,
    displayScanRootSize,
    scopePercent,
    scannedCount,
    completenessNote,
    allVisibleSelected,
    filesPerSec,
    toggleSelectAll,
    listRows,
    selectedPaths,
    hoveredPath,
    toggleRowSelection,
    onHoverChange,
    setActiveRootPath,
}: VisualizationSidebarProps) {
    return (
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-5 py-5">
            <div className="rounded-[26px] border border-white/12 bg-white/[0.06] p-6 shadow-[0_24px_50px_rgba(18,6,54,0.18)]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[13px] font-semibold text-white">
                            {labelFromPath(rootPath)}
                        </p>
                        <p className="mt-2 text-[15px] text-white/58">
                            {formatBytes(displayVisualizationSize)} of {formatBytes(displayScanRootSize)} in view
                        </p>
                    </div>
                    <span className="text-2xl font-semibold tracking-tight text-white/82">
                        {Math.round(scopePercent)}%
                    </span>
                </div>
                <div className="mt-5">
                    <Progress value={Math.max(scopePercent, 4)} />
                </div>
            </div>
            <div className="mt-5 rounded-[24px] border border-white/12 bg-white/[0.06] p-5 shadow-[0_24px_50px_rgba(18,6,54,0.14)]">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[linear-gradient(180deg,rgba(117,212,255,0.95),rgba(121,161,255,0.9))] shadow-[0_8px_16px_rgba(93,154,255,0.22)]">
                        <FolderGlyph className="h-6 w-6 text-white/95" />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-[20px] font-semibold tracking-tight text-white">
                            {labelFromPath(visualizationRoot)}
                        </p>
                        <p className="mt-1 text-[13px] text-white/66">
                            {formatBytes(displayVisualizationSize)} | {formatCount(scannedCount)} items
                        </p>
                    </div>
                </div>
                <p className="mt-3 text-[12px] leading-5 text-white/54">
                    {completenessNote}
                </p>
            </div>

            <div className="mt-5 flex items-center justify-between">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSelectAll}
                    className="text-[15px] font-semibold tracking-tight text-white/88 transition hover:text-white"
                >
                    Select: {allVisibleSelected ? 'None' : 'All'}
                </Button>
                <div className="text-sm text-white/50">
                    {formatCount(filesPerSec)} files/s
                </div>
            </div>

            <SidebarList
                listRows={listRows}
                selectedPaths={selectedPaths}
                hoveredPath={hoveredPath}
                toggleRowSelection={toggleRowSelection}
                onHoverChange={onHoverChange}
                setActiveRootPath={setActiveRootPath}
            />
        </aside>
    );
}
