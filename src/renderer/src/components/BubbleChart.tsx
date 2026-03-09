import React from 'react';
import type { HierarchyCircularNode } from 'd3-hierarchy';
import { formatBytes } from '../utils/helpers';
import { FolderGlyph, StackGlyph } from './icons';
import type { CircleVizNode, DrilldownBubbleNode } from './VisualizationView';

export interface BubbleChartProps {
    packedTree: HierarchyCircularNode<DrilldownBubbleNode> | null;
    isTreePending: boolean;
    circleNodes: CircleVizNode[];
    hoveredNode: CircleVizNode | null;
    selectedPaths: Set<string>;
    hoveredPath: string | null;
    VIEWBOX_WIDTH: number;
    VIEWBOX_HEIGHT: number;
    setActiveRootPath: (path: string) => void;
    onHoverChange: (path: string | null) => void;
}

export function BubbleChart(props: BubbleChartProps) {
    const {
        packedTree,
        isTreePending,
        circleNodes,
        hoveredNode,
        selectedPaths,
        hoveredPath,
        VIEWBOX_WIDTH,
        VIEWBOX_HEIGHT,
        setActiveRootPath,
        onHoverChange,
    } = props;

    if (!packedTree || isTreePending) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/10 border-t-fuchsia-400" />
                <p className="text-sm font-medium text-white/60">Mapping directory structure...</p>
            </div>
        );
    }

    return (
        <div className="flex h-full w-full items-center justify-center p-6 overflow-hidden">
            <div
                className="relative"
                style={{
                    width: '100%',
                    maxWidth: VIEWBOX_WIDTH,
                    aspectRatio: `${VIEWBOX_WIDTH} / ${VIEWBOX_HEIGHT}`,
                }}
                onMouseLeave={() => onHoverChange(null)}
            >
                {circleNodes.map((node) => {
                    const selected = selectedPaths.has(node.path);
                    const hovered = hoveredPath === node.path;

                    let displayR = node.r;
                    // Cap radius to prevent excessively large bubbles when there are very few items
                    const maxR = Math.min(VIEWBOX_WIDTH, VIEWBOX_HEIGHT) * 0.35;
                    if (displayR > maxR) {
                        displayR = maxR;
                    }

                    // Calculate perfect % based positioning
                    const leftPct = ((node.x - displayR) / VIEWBOX_WIDTH) * 100;
                    const topPct = ((node.y - displayR) / VIEWBOX_HEIGHT) * 100;
                    const widthPct = ((displayR * 2) / VIEWBOX_WIDTH) * 100;
                    const heightPct = ((displayR * 2) / VIEWBOX_HEIGHT) * 100;

                    const isLarge = node.r >= 52;
                    const isMedium = node.r >= 40 && !isLarge;
                    const isSmall = node.r >= 24 && !isMedium && !isLarge;

                    if (!isLarge && !isMedium && !isSmall) {
                        // Node is too small to render text, just render the bubble
                        return (
                            <div
                                key={node.path}
                                onClick={() => node.interactive && setActiveRootPath(node.path)}
                                onMouseEnter={() => onHoverChange(node.path)}
                                className={`absolute flex cursor-pointer items-center justify-center rounded-full border transition-all duration-300 ease-out ${selected
                                    ? 'border-white bg-white/30 shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                                    : hovered
                                        ? 'border-white/50 bg-white/20 scale-105 shadow-xl backdrop-blur-md z-20'
                                        : 'border-white/20 bg-white/5 shadow-sm backdrop-blur-sm z-10'
                                    }`}
                                style={{
                                    left: `${leftPct}%`,
                                    top: `${topPct}%`,
                                    width: `${widthPct}%`,
                                    height: `${heightPct}%`,
                                    backgroundColor: node.kind === 'other' ? 'rgba(0,0,0,0.2)' : undefined,
                                }}
                            />
                        );
                    }

                    return (
                        <div
                            key={node.path}
                            onClick={() => node.interactive && setActiveRootPath(node.path)}
                            onMouseEnter={() => onHoverChange(node.path)}
                            className={`absolute flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-full border text-center transition-all duration-300 ease-out ${selected
                                ? 'border-white bg-white/30 shadow-[0_0_20px_rgba(255,255,255,0.4)] z-30'
                                : hovered
                                    ? 'border-white/50 bg-white/20 scale-[1.03] shadow-2xl backdrop-blur-md z-30'
                                    : 'border-white/20 bg-white/10 shadow-lg backdrop-blur-sm z-20 hover:bg-white/15'
                                }`}
                            style={{
                                left: `${leftPct}%`,
                                top: `${topPct}%`,
                                width: `${widthPct}%`,
                                height: `${heightPct}%`,
                                backgroundColor: node.kind === 'other' ? 'rgba(0,0,0,0.3)' : undefined,
                                // Color extraction from D3 payload
                                color: node.text || 'white',
                            }}
                        >
                            <div className="flex flex-col items-center justify-center w-[85%] h-[85%] px-2">
                                {isLarge && (
                                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white/90 shadow-inner">
                                        {node.kind === 'other' ? (
                                            <StackGlyph className="h-5 w-5" />
                                        ) : (
                                            <FolderGlyph className="h-5 w-5" />
                                        )}
                                    </div>
                                )}
                                <span
                                    className={`w-full truncate font-bold tracking-tight drop-shadow-md ${isLarge ? 'text-lg md:text-xl' : isMedium ? 'text-sm md:text-base' : 'text-xs'
                                        }`}
                                >
                                    {node.name}
                                </span>
                                {(isLarge || isMedium) && (
                                    <span
                                        className={`mt-1 w-full truncate font-medium text-white/70 ${isLarge ? 'text-sm' : 'text-xs'
                                            }`}
                                    >
                                        {formatBytes(node.size)}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Hover Tooltip Overlay */}
                {hoveredNode && (() => {
                    const maxR = Math.min(VIEWBOX_WIDTH, VIEWBOX_HEIGHT) * 0.35;
                    const displayR = hoveredNode.r > maxR ? maxR : hoveredNode.r;
                    return (
                        <div
                            className="pointer-events-none absolute z-50 flex w-56 flex-col gap-[2px] rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 shadow-2xl backdrop-blur-xl transition-opacity duration-200"
                            style={{
                                left: `${Math.min(
                                    Math.max(((hoveredNode.x) / VIEWBOX_WIDTH) * 100, 10),
                                    90
                                )}%`,
                                top: `${Math.max(((hoveredNode.y - displayR) / VIEWBOX_HEIGHT) * 100, 5)}%`,
                                transform: 'translate(-50%, -110%)',
                            }}
                        >
                            <h4 className="truncate text-[13px] font-semibold text-white/95">{hoveredNode.name}</h4>
                            <div className="flex items-center justify-between text-[11px] font-medium text-white/50">
                                <span>{hoveredNode.kind === 'other' ? 'Grouped Items' : 'Folder'}</span>
                                <span className="font-mono text-fuchsia-300">{formatBytes(hoveredNode.size)}</span>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
