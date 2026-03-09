import React, { useMemo } from 'react';
import {
    buildBreadcrumbPaths,
    isSameOrChildPath,
    parentPathOf,
} from '../utils/helpers';
import { BubbleChart } from './BubbleChart';
import type { ScanCoverageUpdate, ScanPerfSample, ScanProgressBatch } from '../../../types/contracts';

// Hooks
import { useVisualizationTree } from '../hooks/useVisualizationTree';
import { useSelectionState } from '../hooks/useSelectionState';

// Subcomponents
import { VisualizationSidebar } from './VisualizationSidebar';
import { VisualizationHeader } from './VisualizationHeader';
import { VisualizationFooter } from './VisualizationFooter';

export interface DrilldownBubbleNode {
    path: string;
    name: string;
    size: number;
    selfSize: number;
    children: DrilldownBubbleNode[];
    kind: 'directory' | 'other';
    interactive: boolean;
}

export interface CircleVizNode {
    path: string;
    name: string;
    size: number;
    x: number;
    y: number;
    r: number;
    fill: string;
    stroke: string;
    text: string;
    kind: DrilldownBubbleNode['kind'];
    interactive: boolean;
}

export interface ListRow {
    path: string;
    name: string;
    size: number;
    kind: 'directory' | 'other';
    interactive: boolean;
}

export interface VisualizationViewProps {
    scanId: string;
    progress: ScanProgressBatch | null;
    aggregateSizes: Record<string, number>;
    rootPath: string;
    visualizationRoot: string;
    focusedTopItems: Array<[string, number]>;
    coverageUpdate: ScanCoverageUpdate | null;
    perfSample: ScanPerfSample | null;
    setActiveRootPath: (path: string) => void;
    onExactRecheck?: () => void | Promise<void>;
}

export function VisualizationView({
    progress,
    aggregateSizes,
    rootPath,
    visualizationRoot,
    focusedTopItems,
    coverageUpdate,
    setActiveRootPath,
}: VisualizationViewProps) {
    // 1. D3 Tree & Visualization Hook
    const {
        isTreePending,
        displayScanRootSize,
        displayVisualizationSize,
        listRows,
        packedTree,
        circleNodes,
        VIEWBOX_WIDTH,
        VIEWBOX_HEIGHT,
    } = useVisualizationTree({
        aggregateSizes,
        rootPath,
        visualizationRoot,
        focusedTopItems,
    });

    // 2. Selection & Hover State Hook
    const {
        selectedPaths,
        hoveredPath,
        toggleRowSelection,
        toggleSelectAll,
        clearSelection,
        setHoveredPath,
    } = useSelectionState(visualizationRoot, listRows);

    // 3. Breadcrumb & Navigation
    const breadcrumbPaths = useMemo(() => {
        return buildBreadcrumbPaths(rootPath, visualizationRoot);
    }, [rootPath, visualizationRoot]);

    const parentPath = useMemo(() => {
        const parent = parentPathOf(visualizationRoot);
        return parent && isSameOrChildPath(parent, rootPath) ? parent : null;
    }, [rootPath, visualizationRoot]);

    // 4. Derived Selections & Status
    const hoveredNode = useMemo(() => {
        if (!hoveredPath) return null;
        return circleNodes.find((node) => node.path === hoveredPath) ?? null;
    }, [circleNodes, hoveredPath]);

    const selectedRows = useMemo(() => {
        return listRows.filter((row) => selectedPaths.has(row.path));
    }, [listRows, selectedPaths]);

    const selectedCount = selectedRows.length;
    const selectedSize = selectedRows.reduce((total, row) => total + row.size, 0);
    const allVisibleSelected = listRows.length > 0 && listRows.every((row) => selectedPaths.has(row.path));

    const scannedCount = progress?.progress.scannedCount ?? 0;
    const completeness = coverageUpdate?.coverage.completeness ?? 'exact';
    const blockedByPermission = coverageUpdate?.coverage.blockedByPermission ?? 0;
    const skippedByScope = coverageUpdate?.coverage.skippedByScope ?? 0;
    const nonRemovableVisible = coverageUpdate?.coverage.nonRemovableVisible ?? 0;

    const completenessNote = completeness === 'partial_permission'
        ? 'Some protected folders were excluded because macOS permission was missing.'
        : completeness === 'partial_scope'
            ? 'Some folders on a different mounted volume were excluded from the root total.'
            : completeness === 'partial_mixed'
                ? 'Both protected folders and cross-volume folders were excluded from the final total.'
                : 'All reachable folders in the selected volume were included.';
    const scopePercent = displayScanRootSize > 0
        ? Math.min(100, (displayVisualizationSize / displayScanRootSize) * 100)
        : 0;

    const filesPerSec = 0;

    return (
        <div
            className="relative h-screen w-full self-stretch overflow-hidden text-white"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
            <div className="absolute inset-0 bg-[linear-gradient(180deg,#6028c7_0%,#33106b_58%,#22084f_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(172,112,255,0.2),transparent_26%),radial-gradient(circle_at_78%_22%,rgba(126,223,255,0.16),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.06),transparent_32%)]" />

            <div className="relative z-10 flex h-full w-full flex-col">
                <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] max-lg:grid-cols-1">
                    <VisualizationSidebar
                        rootPath={rootPath}
                        visualizationRoot={visualizationRoot}
                        displayVisualizationSize={displayVisualizationSize}
                        displayScanRootSize={displayScanRootSize}
                        scopePercent={scopePercent}
                        scannedCount={scannedCount}
                        completenessNote={completenessNote}
                        allVisibleSelected={allVisibleSelected}
                        filesPerSec={filesPerSec}
                        toggleSelectAll={toggleSelectAll}
                        listRows={listRows}
                        selectedPaths={selectedPaths}
                        hoveredPath={hoveredPath}
                        toggleRowSelection={toggleRowSelection}
                        onHoverChange={setHoveredPath}
                        setActiveRootPath={setActiveRootPath}
                    />

                    <section className="relative min-w-0 flex-1 flex flex-col overflow-hidden">
                        <VisualizationHeader
                            parentPath={parentPath}
                            rootPath={rootPath}
                            breadcrumbPaths={breadcrumbPaths}
                            setActiveRootPath={setActiveRootPath}
                        />

                        <div className="relative flex-1 flex items-center justify-center px-8 pb-10">
                            <div className="absolute inset-0 z-0">
                                <BubbleChart
                                    packedTree={packedTree}
                                    isTreePending={isTreePending}
                                    circleNodes={circleNodes}
                                    hoveredNode={hoveredNode}
                                    selectedPaths={selectedPaths}
                                    hoveredPath={hoveredPath}
                                    VIEWBOX_WIDTH={VIEWBOX_WIDTH}
                                    VIEWBOX_HEIGHT={VIEWBOX_HEIGHT}
                                    setActiveRootPath={setActiveRootPath}
                                    onHoverChange={setHoveredPath}
                                />
                            </div>
                        </div>
                    </section>
                </div>

                <VisualizationFooter
                    selectedCount={selectedCount}
                    selectedSize={selectedSize}
                    blockedByPermission={blockedByPermission}
                    skippedByScope={skippedByScope}
                    nonRemovableVisible={nonRemovableVisible}
                    clearSelection={clearSelection}
                />
            </div>
        </div>
    );
}
