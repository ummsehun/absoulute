import React, { useMemo, useState } from 'react';
import { hierarchy, pack, treemap } from 'd3-hierarchy';
import {
    buildVizTree,
    formatBytes,
    formatScanSpeed,
    labelFromPath,
    nodeColor,
    normalizeFsPath,
    truncateLabel,
    MAP_HEIGHT,
    MAP_WIDTH,
    VizTreeNode
} from '../utils/helpers';
import type { ScanProgressBatch } from '../../../types/contracts';

interface CircleVizNode {
    path: string;
    name: string;
    size: number;
    depth: number;
    x: number;
    y: number;
    r: number;
}

interface RectVizNode {
    path: string;
    name: string;
    size: number;
    depth: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

type LayoutMode = "circle_pack" | "treemap";

interface VisualizationViewProps {
    scanId: string;
    progress: ScanProgressBatch | null;
    scanStartedAt: number | null;
    aggregateSizes: Record<string, number>;
    scanBasePath: string;
    rootPath: string;
    visualizationRoot: string;
    breadcrumbPaths: string[];
    focusedTopItems: Array<[string, number]>;
    setActiveRootPath: (path: string) => void;
    startScan: () => void;
    pauseScan: () => void;
    cancelScan: () => void;
}

export function VisualizationView({
    scanId,
    progress,
    scanStartedAt,
    aggregateSizes,
    scanBasePath,
    rootPath,
    visualizationRoot,
    breadcrumbPaths,
    focusedTopItems,
    setActiveRootPath,
    startScan,
    pauseScan,
    cancelScan,
}: VisualizationViewProps) {
    const [layoutMode, setLayoutMode] = useState<LayoutMode>("circle_pack");

    const circleNodes = useMemo(() => {
        if (layoutMode !== "circle_pack") return [];
        const tree = buildVizTree(aggregateSizes, visualizationRoot);
        if (!tree) return [];

        const packed = pack<VizTreeNode>()
            .size([MAP_WIDTH, MAP_HEIGHT])
            .padding(4)(
                hierarchy(tree)
                    .sum((node) => node.selfSize)
                    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
            );

        return packed
            .descendants()
            .filter((node) => node.depth > 0 && (node.value ?? 0) > 0)
            .map(
                (node): CircleVizNode => ({
                    path: node.data.path,
                    name: node.data.name,
                    size: node.data.size,
                    depth: node.depth,
                    x: node.x,
                    y: node.y,
                    r: node.r,
                }),
            );
    }, [aggregateSizes, layoutMode, visualizationRoot]);

    const rectNodes = useMemo(() => {
        if (layoutMode !== "treemap") return [];
        const tree = buildVizTree(aggregateSizes, visualizationRoot);
        if (!tree) return [];

        const mapped = treemap<VizTreeNode>()
            .size([MAP_WIDTH, MAP_HEIGHT])
            .paddingOuter(4)
            .paddingInner(2)
            .round(true)(
                hierarchy(tree)
                    .sum((node) => node.selfSize)
                    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
            );

        return mapped
            .descendants()
            .filter((node) => node.depth > 0 && (node.value ?? 0) > 0)
            .map(
                (node): RectVizNode => ({
                    path: node.data.path,
                    name: node.data.name,
                    size: node.data.size,
                    depth: node.depth,
                    x0: node.x0,
                    y0: node.y0,
                    x1: node.x1,
                    y1: node.y1,
                }),
            );
    }, [aggregateSizes, layoutMode, visualizationRoot]);

    return (
        <div className="flex-1 flex flex-col p-6 pt-10 w-full max-w-7xl mx-auto h-full relative z-10">
            <header
                className="flex justify-between items-center mb-6 pl-20 pr-6"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                <div>
                    <h2 className="text-2xl font-semibold drop-shadow-sm">Space Lens</h2>
                    <div
                        className="text-sm text-white/50 mt-1.5 flex flex-wrap gap-2 items-center"
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    >
                        {breadcrumbPaths.length === 0 ? (
                            <span>-</span>
                        ) : (
                            breadcrumbPaths.map((pathItem, index) => (
                                <button
                                    key={`${pathItem}-${index}`}
                                    type="button"
                                    className={`hover:text-white transition-colors drop-shadow-md ${pathItem === visualizationRoot ? "text-purple-300 font-bold" : ""}`}
                                    onClick={() => setActiveRootPath(pathItem)}
                                >
                                    {labelFromPath(pathItem)} {index < breadcrumbPaths.length - 1 && "›"}
                                </button>
                            ))
                        )}
                        <button
                            type="button"
                            className="ml-4 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs transition border border-white/5 shadow-sm"
                            onClick={() => setActiveRootPath(scanBasePath || normalizeFsPath(rootPath))}
                        >
                            전체 보기
                        </button>
                    </div>
                </div>

                <div
                    className="flex gap-2 bg-white/5 rounded-lg p-1.5 border border-white/10 shadow-lg"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    <button
                        type="button"
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${layoutMode === "circle_pack" ? "bg-purple-600 text-white shadow-md" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                        onClick={() => setLayoutMode("circle_pack")}
                    >
                        Circle Pack
                    </button>
                    <button
                        type="button"
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${layoutMode === "treemap" ? "bg-purple-600 text-white shadow-md" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                        onClick={() => setLayoutMode("treemap")}
                    >
                        Treemap
                    </button>
                </div>
            </header>

            <div className="flex-1 flex gap-6 min-h-0 px-2 pb-6">
                <div className="flex-1 rounded-[32px] border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden relative shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)] flex items-center justify-center p-4">
                    {layoutMode === "circle_pack" ? (
                        circleNodes.length === 0 ? (
                            <p className="text-white/50 animate-pulse text-lg">Scanning and aggregating nodes...</p>
                        ) : (
                            <svg
                                className="w-full h-full object-contain filter drop-shadow-xl"
                                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                            >
                                {circleNodes.map((node) => (
                                    <g
                                        key={`circle-${node.path}`}
                                        className="cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => setActiveRootPath(node.path)}
                                    >
                                        <circle
                                            cx={node.x}
                                            cy={node.y}
                                            r={node.r}
                                            fill={nodeColor(node.depth, node.path)}
                                            stroke="rgba(255,255,255,0.15)"
                                            strokeWidth={1}
                                        />
                                        {node.r > 26 ? (
                                            <text x={node.x} y={node.y} textAnchor="middle" className="fill-white/90 text-[11px] font-semibold pointer-events-none tracking-wide" style={{ textShadow: "0px 2px 4px rgba(0,0,0,0.5)" }}>
                                                {truncateLabel(node.name, Math.floor(node.r / 4))}
                                            </text>
                                        ) : null}
                                        <title>{`${node.path}\n${formatBytes(node.size)}`}</title>
                                    </g>
                                ))}
                            </svg>
                        )
                    ) : rectNodes.length === 0 ? (
                        <p className="text-white/50 animate-pulse text-lg">Scanning and aggregating nodes...</p>
                    ) : (
                        <svg
                            className="w-full h-full object-contain filter drop-shadow-xl"
                            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                        >
                            {rectNodes.map((node) => {
                                const width = Math.max(node.x1 - node.x0, 0);
                                const height = Math.max(node.y1 - node.y0, 0);
                                return (
                                    <g
                                        key={`rect-${node.path}`}
                                        className="cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => setActiveRootPath(node.path)}
                                    >
                                        <rect
                                            x={node.x0}
                                            y={node.y0}
                                            width={width}
                                            height={height}
                                            fill={nodeColor(node.depth, node.path)}
                                            stroke="rgba(255,255,255,0.15)"
                                            strokeWidth={1}
                                            rx={width > 20 && height > 20 ? 4 : 0}
                                        />
                                        {width > 90 && height > 28 ? (
                                            <text
                                                x={node.x0 + 10}
                                                y={node.y0 + 20}
                                                textAnchor="start"
                                                className="fill-white/90 text-[12px] font-semibold pointer-events-none tracking-wide"
                                                style={{ textShadow: "0px 2px 4px rgba(0,0,0,0.5)" }}
                                            >
                                                {truncateLabel(node.name, Math.floor(width / 9))}
                                            </text>
                                        ) : null}
                                        <title>{`${node.path}\n${formatBytes(node.size)}`}</title>
                                    </g>
                                );
                            })}
                        </svg>
                    )}
                </div>

                <aside className="w-80 flex flex-col gap-5">
                    <div className="rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-md p-6 flex-1 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                        <h3 className="text-xl font-semibold mb-5 text-white shadow-sm">Top Items</h3>
                        {focusedTopItems.length === 0 ? (
                            <p className="text-white/40 text-sm">No items to display</p>
                        ) : (
                            <ul className="flex flex-col gap-3">
                                {focusedTopItems.map(([nodePath, size], index) => (
                                    <li key={`top-${nodePath}-${index}`} className="flex justify-between items-center text-sm gap-3 group">
                                        <button
                                            type="button"
                                            className="flex-1 text-left truncate text-white/70 group-hover:text-white transition-colors"
                                            onClick={() => setActiveRootPath(nodePath)}
                                            title={nodePath}
                                        >
                                            {labelFromPath(nodePath)}
                                        </button>
                                        <span className="text-purple-200 font-mono text-[11px] font-semibold whitespace-nowrap bg-purple-900/40 px-2.5 py-1 rounded-md border border-purple-500/20 shadow-inner">
                                            {formatBytes(size)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-md p-5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] flex flex-col gap-3">
                        <div className="flex justify-between items-center text-sm font-medium text-white/60 mb-1">
                            <span className="flex items-center gap-2">
                                {scanId && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
                                {scanId ? (progress?.progress.phase || "scanning") : "idle"}
                            </span>
                            <span className="font-mono text-xs">{formatScanSpeed(progress?.progress.scannedCount ?? 0, scanStartedAt)}</span>
                        </div>
                        {scanId && (
                            <div className="flex gap-3">
                                <button onClick={pauseScan} className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition border border-white/5">Pause</button>
                                <button onClick={cancelScan} className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-xl text-sm font-medium transition border border-red-500/20">Cancel</button>
                            </div>
                        )}
                        {!scanId && (
                            <button onClick={startScan} className="w-full py-2.5 bg-purple-600/60 hover:bg-purple-600/80 rounded-xl text-sm font-medium transition border border-purple-500/30 shadow-lg text-white">
                                보여지는 경로 스캔 재시작
                            </button>
                        )}
                    </div>
                </aside>
            </div>

            {scanId && (
                <div className="absolute top-6 right-6 text-xs text-white/50 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur z-50">
                    Scanning...
                </div>
            )}
        </div>
    );
}
