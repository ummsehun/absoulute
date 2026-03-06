import React, { useMemo, useState } from 'react';
import { hierarchy, pack } from 'd3-hierarchy';
import {
    buildVizTree,
    formatBytes,
    labelFromPath,
    nodeColor,
    truncateLabel,
    MAP_HEIGHT,
    MAP_WIDTH,
    VizTreeNode
} from '../utils/helpers';
import type { ScanCoverageUpdate, ScanPerfSample, ScanProgressBatch } from '../../../types/contracts';

interface CircleVizNode {
    path: string;
    name: string;
    size: number;
    depth: number;
    x: number;
    y: number;
    r: number;
}

type LayoutMode = "circle_pack" | "treemap";

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

export function VisualizationView({
    scanId,
    progress,
    aggregateSizes,
    rootPath,
    visualizationRoot,
    focusedTopItems,
    coverageUpdate,
    perfSample,
    setActiveRootPath,
    onExactRecheck,
}: VisualizationViewProps) {
    const [layoutMode] = useState<LayoutMode>("circle_pack");

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

    return (
        <div className="flex-1 flex flex-col w-full h-full relative z-10 bg-transparent text-white overflow-hidden pb-4 px-4 pt-10" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>

            {/* Top Navigation Bar Component (Like Finder) */}
            <div className="flex items-center justify-between px-4 pb-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition">
                        <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition">
                        <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>

                <div className="flex items-center gap-2 font-medium text-white/80 drop-shadow-md">
                    <svg className="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" opacity="0.2" /><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 18V6h16v12H4z" /></svg>
                    {labelFromPath(visualizationRoot || rootPath)}
                </div>

                <div className="text-xs text-white/70 font-mono">
                    <span className={`px-2 py-1 rounded-full border ${progress?.progress.estimated ? "border-amber-300/60 bg-amber-500/20" : "border-emerald-300/60 bg-emerald-500/20"}`}>
                        {progress?.progress.estimated ? "Estimated" : "Exact"}
                    </span>
                </div>
            </div>

            <div className="flex-1 flex gap-6 min-h-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                {/* Left Sidebar */}
                <aside className="w-[320px] flex flex-col rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden relative">
                    {/* Sidebar Header: Drive Info */}
                    <div className="p-5 border-b border-white/5 bg-white/5">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-white/10 rounded-xl border border-white/10 flex items-center justify-center shadow-inner">
                                <svg className="w-6 h-6 text-gray-300" fill="currentColor" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 18V6h16v12H4z" /></svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold">{labelFromPath(rootPath)}</h3>
                                <p className="text-xs text-white/50">{formatBytes(aggregateSizes[rootPath] || 0)} | 항목 {progress?.progress.scannedCount || 0}개</p>
                            </div>
                        </div>
                        <div className="text-sm text-white/70">선택: 없음 </div>
                    </div>

                    {/* Top Items List */}
                    <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: 'none' }}>
                        {focusedTopItems.length === 0 ? (
                            <div className="p-4 text-center text-white/40 text-sm">항목이 없습니다.</div>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {focusedTopItems.map(([nodePath, size], index) => (
                                    <li key={`top-${nodePath}-${index}`} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/10 transition cursor-pointer group" onClick={() => setActiveRootPath(nodePath)}>
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-6 h-6 flex items-center justify-center text-cyan-400">
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                                            </div>
                                            <span className="text-sm font-medium text-white/80 group-hover:text-white truncate">{labelFromPath(nodePath)}</span>
                                        </div>
                                        <span className="text-xs font-mono text-white/50 whitespace-nowrap">{formatBytes(size)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </aside>

                {/* Center Map Area */}
                <main className="flex-1 relative flex items-center justify-center rounded-[32px] overflow-hidden">
                    {layoutMode === "circle_pack" ? (
                        circleNodes.length === 0 ? (
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 rounded-full border-4 border-purple-500 border-t-transparent animate-spin mb-4" />
                                <p className="text-white/50 text-lg">데이터 분석 중...</p>
                            </div>
                        ) : (
                            <svg className="w-full h-full object-contain filter drop-shadow-2xl" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
                                {circleNodes.map((node) => (
                                    <g key={`circle-${node.path}`} className="cursor-pointer transition-transform hover:scale-[1.02] origin-center" onClick={() => setActiveRootPath(node.path)}>
                                        <circle
                                            cx={node.x}
                                            cy={node.y}
                                            r={node.r}
                                            fill={nodeColor(node.depth, node.path)}
                                            style={{ filter: "drop-shadow(0px 10px 20px rgba(0,0,0,0.5))" }}
                                            className="transition-colors hover:brightness-110"
                                        />
                                        {node.r > 26 ? (
                                            <foreignObject x={node.x - node.r} y={node.y - node.r} width={node.r * 2} height={node.r * 2}>
                                                <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none text-white drop-shadow-md p-2">
                                                    <svg className="w-10 h-10 mb-2 opacity-80" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                                                    <span className="text-sm font-bold truncate w-full text-center leading-tight">{truncateLabel(node.name, 16)}</span>
                                                    <span className="text-xs opacity-70 font-mono mt-0.5">{formatBytes(node.size)}</span>
                                                </div>
                                            </foreignObject>
                                        ) : null}
                                        <title>{`${node.path}\n${formatBytes(node.size)}`}</title>
                                    </g>
                                ))}
                            </svg>
                        )
                    ) : (
                        <div className="text-center text-white/50">Treemap mode not styled for this view yet.</div>
                    )}
                </main>
            </div>

            {/* Bottom Floating Footer Area */}
            <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end pointer-events-none z-50">
                {/* Bottom Left Drive Progress */}
                <div className="pointer-events-auto">
                    <div className="flex justify-between text-xs text-white/70 mb-2 font-medium">
                        <span>{labelFromPath(rootPath)}</span>
                        <span className="font-mono text-white/50">{formatBytes(aggregateSizes[rootPath] || 0)} 사용 중</span>
                    </div>
                    <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-md">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 w-1/2" /> {/* Example progress */}
                    </div>
                </div>

                {/* Bottom Right Actions */}
                <div className="flex items-center gap-6 pointer-events-auto drop-shadow-xl">
                    <div className="flex items-center gap-3 text-sm text-white/60 font-medium">
                        <div className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center text-xs">i</div>
                        <span>files/s {Math.round(perfSample?.filesPerSec ?? 0).toLocaleString()}</span>
                        <span className="text-white/40">|</span>
                        <span>blocked {coverageUpdate?.coverage.blockedByPolicy ?? 0}</span>
                        <span className="text-white/40">|</span>
                        <span>deferred {perfSample?.deferredByBudget ?? 0}</span>
                    </div>
                    {progress?.progress.estimated ? (
                        <button
                            type="button"
                            onClick={() => {
                                void onExactRecheck?.();
                            }}
                            className="px-6 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-300/50 backdrop-blur-xl transition-all shadow-lg text-sm font-semibold text-emerald-100"
                        >
                            Exact Recheck
                        </button>
                    ) : null}
                    <button className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-xl transition-all shadow-lg text-sm font-medium hover:text-white">
                        검토 및 제거
                    </button>
                </div>
            </div>

            {scanId && (
                <div className="absolute top-20 right-6 text-xs text-white bg-indigo-500/80 px-3 py-1.5 rounded-full backdrop-blur z-50 animate-pulse border border-white/20 shadow-lg pointer-events-none">
                    Scanning in progress...
                </div>
            )}
        </div>
    );
}
