import React, { useDeferredValue, useMemo, useState } from 'react';
import { hierarchy, pack } from 'd3-hierarchy';
import {
    buildBreadcrumbPaths,
    formatBytes,
    formatCount,
    getDisplaySizeForPath,
    isSameOrChildPath,
    labelFromPath,
    parentPathOf,
    resolveBubbleTone,
    truncateLabel,
} from '../utils/helpers';
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    FolderGlyph,
    HomeGlyph,
} from './icons';
import { BubbleChart } from './BubbleChart';
import { SidebarList } from './SidebarList';
import type { ScanCoverageUpdate, ScanPerfSample, ScanProgressBatch } from '../../../types/contracts';

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

interface VisualizationViewProps {
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

const VIEWBOX_WIDTH = 980;
const VIEWBOX_HEIGHT = 760;
const MAX_VISIBLE_BUBBLES = 8;
const EMPTY_PATH_SET = new Set<string>();


export function VisualizationView({
    progress,
    aggregateSizes,
    rootPath,
    visualizationRoot,
    focusedTopItems,
    coverageUpdate,
    // perfSample, // Removed as per instruction
    setActiveRootPath,
}: VisualizationViewProps) {
    const deferredAggregateSizes = useDeferredValue(aggregateSizes);
    const deferredVisualizationRoot = useDeferredValue(visualizationRoot);
    const deferredFocusedTopItems = useDeferredValue(focusedTopItems);
    const [selectionState, setSelectionState] = useState<{
        scopePath: string;
        paths: Set<string>;
    }>({
        scopePath: visualizationRoot,
        paths: new Set(),
    });
    const [hoverState, setHoverState] = useState<{
        scopePath: string;
        path: string | null;
    }>({
        scopePath: visualizationRoot,
        path: null,
    });

    const displayScanRootSize = useMemo(() => {
        return getDisplaySizeForPath(deferredAggregateSizes, rootPath);
    }, [deferredAggregateSizes, rootPath]);

    const displayVisualizationSize = useMemo(() => {
        return getDisplaySizeForPath(
            deferredAggregateSizes,
            deferredVisualizationRoot || rootPath,
        );
    }, [deferredAggregateSizes, deferredVisualizationRoot, rootPath]);

    const visibleChildren = useMemo(() => {
        return deferredFocusedTopItems.slice(0, MAX_VISIBLE_BUBBLES);
    }, [deferredFocusedTopItems]);

    const displayedChildrenTotal = useMemo(() => {
        return visibleChildren.reduce((total, [, size]) => total + size, 0);
    }, [visibleChildren]);

    const remainderSize = Math.max(displayVisualizationSize - displayedChildrenTotal, 0);
    const showRemainderBubble =
        remainderSize > 0 &&
        (visibleChildren.length === 0 || remainderSize / Math.max(displayVisualizationSize, 1) >= 0.04);

    const listRows = useMemo<ListRow[]>(() => {
        const rows: ListRow[] = visibleChildren.map(([nodePath, size]) => ({
            path: nodePath,
            name: labelFromPath(nodePath),
            size,
            kind: 'directory',
            interactive: true,
        }));

        if (showRemainderBubble) {
            rows.push({
                path: `${deferredVisualizationRoot || rootPath}#other`,
                name: visibleChildren.length === 0 ? 'Loose Files' : 'Other Items',
                size: remainderSize,
                kind: 'other',
                interactive: false,
            });
        }

        return rows;
    }, [
        deferredVisualizationRoot,
        remainderSize,
        rootPath,
        showRemainderBubble,
        visibleChildren,
    ]);

    const drilldownTree = useMemo<DrilldownBubbleNode | null>(() => {
        const currentPath = deferredVisualizationRoot || rootPath;
        const children: DrilldownBubbleNode[] = listRows.map((row) => ({
            path: row.path,
            name: row.name,
            size: row.size,
            selfSize: row.size,
            children: [],
            kind: row.kind,
            interactive: row.interactive,
        }));

        if (displayVisualizationSize <= 0 && children.length === 0) {
            return null;
        }

        return {
            path: currentPath,
            name: labelFromPath(currentPath),
            size: Math.max(displayVisualizationSize, displayedChildrenTotal + remainderSize),
            selfSize: 0,
            children,
            kind: 'directory',
            interactive: false,
        };
    }, [
        deferredVisualizationRoot,
        displayedChildrenTotal,
        displayVisualizationSize,
        listRows,
        remainderSize,
        rootPath,
    ]);

    const packedTree = useMemo(() => {
        if (!drilldownTree) {
            return null;
        }

        return pack<DrilldownBubbleNode>()
            .size([VIEWBOX_WIDTH, VIEWBOX_HEIGHT])
            .padding(5)(
                hierarchy(drilldownTree)
                    .sum((node) => node.selfSize)
                    .sort((left, right) => (right.value ?? 0) - (left.value ?? 0)),
            );
    }, [drilldownTree]);

    const circleNodes = useMemo(() => {
        if (!packedTree) {
            return [] as CircleVizNode[];
        }

        return (packedTree.children ?? [])
            .filter((node) => node.r >= 20 && (node.value ?? 0) > 0)
            .sort((left, right) => right.r - left.r)
            .map((node): CircleVizNode => {
                const tone =
                    node.data.kind === 'other'
                        ? {
                            fill: 'rgba(255,255,255,0.16)',
                            stroke: 'rgba(255,255,255,0.28)',
                            text: 'rgba(255,255,255,0.86)',
                        }
                        : resolveBubbleTone(node.data.path);

                return {
                    path: node.data.path,
                    name: node.data.name,
                    size: node.data.size,
                    x: node.x,
                    y: node.y,
                    r: node.r,
                    fill: tone.fill,
                    stroke: tone.stroke,
                    text: tone.text,
                    kind: node.data.kind,
                    interactive: node.data.interactive,
                };
            });
    }, [packedTree]);

    const breadcrumbPaths = useMemo(() => {
        return buildBreadcrumbPaths(rootPath, visualizationRoot);
    }, [rootPath, visualizationRoot]);

    const parentPath = useMemo(() => {
        const parent = parentPathOf(visualizationRoot);
        if (!parent) {
            return null;
        }

        return isSameOrChildPath(parent, rootPath) ? parent : null;
    }, [rootPath, visualizationRoot]);

    const selectedPaths =
        selectionState.scopePath === visualizationRoot ? selectionState.paths : EMPTY_PATH_SET;
    const hoveredPath = hoverState.scopePath === visualizationRoot ? hoverState.path : null;

    const hoveredNode = useMemo(() => {
        if (!hoveredPath) {
            return null;
        }

        return circleNodes.find((node) => node.path === hoveredPath) ?? null;
    }, [circleNodes, hoveredPath]);

    const selectedRows = useMemo(() => {
        return listRows.filter((row) => selectedPaths.has(row.path));
    }, [listRows, selectedPaths]);

    const selectedCount = selectedRows.length;
    const selectedSize = selectedRows.reduce((total, row) => total + row.size, 0);
    const allVisibleSelected = listRows.length > 0 && listRows.every((row) => selectedPaths.has(row.path));

    const isTreePending =
        deferredAggregateSizes !== aggregateSizes ||
        deferredVisualizationRoot !== visualizationRoot ||
        deferredFocusedTopItems !== focusedTopItems;

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

    const filesPerSec = 0; // Keeping simplified

    const toggleRowSelection = (path: string) => {
        setSelectionState((prev) => {
            const next = new Set(
                prev.scopePath === visualizationRoot ? prev.paths : EMPTY_PATH_SET,
            );

            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }

            return {
                scopePath: visualizationRoot,
                paths: next,
            };
        });
    };

    const toggleSelectAll = () => {
        setSelectionState((prev) => {
            const scopedPaths =
                prev.scopePath === visualizationRoot ? prev.paths : EMPTY_PATH_SET;

            if (listRows.length === 0) {
                return {
                    scopePath: visualizationRoot,
                    paths: new Set(),
                };
            }

            if (listRows.every((row) => scopedPaths.has(row.path))) {
                return {
                    scopePath: visualizationRoot,
                    paths: new Set(),
                };
            }

            return {
                scopePath: visualizationRoot,
                paths: new Set(listRows.map((row) => row.path)),
            };
        });
    };

    return (
        <div
            className="relative min-h-screen w-full self-stretch overflow-hidden text-white"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
            <div className="absolute inset-0 bg-[linear-gradient(180deg,#6028c7_0%,#33106b_58%,#22084f_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(172,112,255,0.2),transparent_26%),radial-gradient(circle_at_78%_22%,rgba(126,223,255,0.16),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.06),transparent_32%)]" />

            <div className="relative z-10 flex h-full w-full">
                <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] max-lg:grid-cols-1">
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
                            <div className="mt-5 h-3 rounded-full bg-black/18 p-[2px]">
                                <div
                                    className="h-full rounded-full bg-[linear-gradient(90deg,#ffffff_0%,#c7ceff_40%,#79dfff_100%)]"
                                    style={{ width: `${Math.max(scopePercent, 4)}%` }}
                                />
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
                            <button
                                type="button"
                                onClick={toggleSelectAll}
                                className="text-[15px] font-semibold tracking-tight text-white/88 transition hover:text-white"
                            >
                                Select: {allVisibleSelected ? 'None' : 'All'}
                            </button>
                            <div className="text-sm text-white/50">
                                {formatCount(filesPerSec)} files/s
                            </div>
                        </div>

                        <SidebarList
                            listRows={listRows}
                            selectedPaths={selectedPaths}
                            hoveredPath={hoveredPath}
                            toggleRowSelection={toggleRowSelection}
                            onHoverChange={(path) =>
                                setHoverState((prev) =>
                                    path === null && prev.scopePath === visualizationRoot
                                        ? { scopePath: visualizationRoot, path: null }
                                        : { scopePath: visualizationRoot, path }
                                )
                            }
                            setActiveRootPath={setActiveRootPath}
                        />
                    </aside>

                    <section className="relative min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-3 px-8 py-7">
                            <button
                                type="button"
                                onClick={() => {
                                    if (parentPath) {
                                        setActiveRootPath(parentPath);
                                    }
                                }}
                                disabled={!parentPath}
                                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white/72 transition hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronLeftIcon className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveRootPath(rootPath)}
                                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white/72 transition hover:bg-white/12 hover:text-white"
                            >
                                <HomeGlyph className="h-5 w-5" />
                            </button>
                            <div className="min-w-0 flex items-center gap-2 overflow-hidden text-base text-white/84">
                                {breadcrumbPaths.map((path, index) => (
                                    <React.Fragment key={path}>
                                        {index > 0 ? <ChevronRightIcon className="h-4 w-4 shrink-0 text-white/34" /> : null}
                                        <button
                                            type="button"
                                            onClick={() => setActiveRootPath(path)}
                                            className="flex shrink-0 items-center gap-2 rounded-full px-2 py-1 text-left transition hover:bg-white/8"
                                        >
                                            <FolderGlyph className="h-4 w-4 text-cyan-200/92" />
                                            <span className="truncate">{truncateLabel(labelFromPath(path), 18)}</span>
                                        </button>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>

                        <div className="absolute inset-x-0 top-20 bottom-0 flex items-center justify-center px-8 pb-10">
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
                                    onHoverChange={(path) =>
                                        setHoverState(() => ({
                                            scopePath: visualizationRoot,
                                            path,
                                        }))
                                    }
                                />
                            </div>
                            <div className="absolute top-0 right-0 z-50 bg-black text-white p-4 font-mono text-xs" style={{ whiteSpace: 'pre' }}>
                                DEBUG INFO:
                                circleNodes.length: {circleNodes.length}
                                isTreePending: {isTreePending ? 'true' : 'false'}
                                packedTree: {packedTree ? 'true' : 'false'}
                                drilldownTree.size: {drilldownTree?.size ?? 'N/A'}
                                displayVisualizationSize: {displayVisualizationSize}
                                listRows.length: {listRows.length}
                            </div>
                        </div>
                    </section>
                </div>

                <footer className="flex items-center justify-between gap-4 border-t border-white/10 px-6 py-4 text-white/84">
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
                        <button
                            type="button"
                            onClick={() =>
                                setSelectionState({
                                    scopePath: visualizationRoot,
                                    paths: new Set(),
                                })
                            }
                            className="rounded-full border border-white/12 bg-white/6 px-5 py-3 text-base font-semibold text-white/82 transition hover:bg-white/12 hover:text-white"
                        >
                            Clear Selection
                        </button>
                        <button
                            type="button"
                            disabled={selectedCount === 0}
                            className="rounded-full bg-[linear-gradient(180deg,#e262ea_0%,#aa43e5_100%)] px-7 py-3 text-base font-semibold text-white shadow-[0_16px_34px_rgba(170,67,229,0.36)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            Review and Remove
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}

