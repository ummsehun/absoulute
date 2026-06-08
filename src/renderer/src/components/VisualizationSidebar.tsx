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
        <aside className="flex min-h-0 flex-col border-r border-white/10 bg-black/15 backdrop-blur-xl px-4 py-5 gap-4">
            {/* Unified Sleek Stats Header Container */}
            <div className="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_50px_rgba(18,6,54,0.12)]">
                {/* Section 1: Scan Target (Root Path) */}
                <div className="flex flex-col">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Scan Target</p>
                    <div className="mt-1.5 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate text-base font-semibold tracking-tight text-white" title={rootPath}>
                                {labelFromPath(rootPath)}
                            </h2>
                            <p className="mt-0.5 truncate text-[11px] font-mono text-white/50" title={rootPath}>
                                {rootPath}
                            </p>
                        </div>
                        <span className="text-xl font-bold tracking-tight text-fuchsia-400 font-mono">
                            {Math.round(scopePercent)}%
                        </span>
                    </div>
                    
                    <div className="mt-3 flex items-center justify-between text-xs text-white/60">
                        <span>In View Size</span>
                        <span className="font-semibold text-white/90">
                            {formatBytes(displayVisualizationSize)} / {formatBytes(displayScanRootSize)}
                        </span>
                    </div>
                    <div className="mt-2">
                        <Progress value={Math.max(scopePercent, 4)} className="h-1.5" />
                    </div>
                </div>

                {/* Subtle Divider */}
                <div className="h-px bg-white/5" />

                {/* Section 2: Current Focus Folder */}
                <div className="flex flex-col">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Inspecting Directory</p>
                    <div className="mt-2.5 flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(180deg,rgba(186,124,255,0.2),rgba(140,175,255,0.15))] border border-white/10 shadow-inner">
                            <FolderGlyph className="h-4.5 w-4.5 text-fuchsia-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate text-[15px] font-semibold text-white" title={visualizationRoot}>
                                {labelFromPath(visualizationRoot)}
                            </h3>
                            <p className="mt-0.5 text-xs text-white/50">
                                {formatBytes(displayVisualizationSize)} | {formatCount(scannedCount)} items
                            </p>
                        </div>
                    </div>
                    {completenessNote && (
                        <p className="mt-2.5 text-[11px] leading-relaxed text-white/40 italic">
                            {completenessNote}
                        </p>
                    )}
                </div>
            </div>

            {/* List Selection & Speed Header */}
            <div className="flex items-center justify-between px-1 mt-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleSelectAll}
                    className="text-xs font-semibold tracking-tight text-white/70 hover:text-white hover:bg-white/5 rounded-lg h-7 px-2"
                >
                    Select: {allVisibleSelected ? 'None' : 'All'}
                </Button>
                {filesPerSec > 0 && (
                    <div className="text-[11px] font-mono text-white/40">
                        {formatCount(filesPerSec)} files/s
                    </div>
                )}
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
