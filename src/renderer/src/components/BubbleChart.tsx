import type { HierarchyCircularNode } from 'd3-hierarchy';
import { formatBytes } from '../utils/helpers';
import { NativeFileIcon } from './icons';
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

interface BubbleNodeProps {
    node: CircleVizNode;
    selected: boolean;
    hovered: boolean;
    VIEWBOX_WIDTH: number;
    VIEWBOX_HEIGHT: number;
    setActiveRootPath: (path: string) => void;
    onHoverChange: (path: string | null) => void;
}

function BubbleNode({ node, selected, hovered, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, setActiveRootPath, onHoverChange }: BubbleNodeProps) {
    let displayR = node.r;
    const maxR = Math.min(VIEWBOX_WIDTH, VIEWBOX_HEIGHT) * 0.35;
    if (displayR > maxR) displayR = maxR;

    const leftPct = ((node.x - displayR) / VIEWBOX_WIDTH) * 100;
    const topPct = ((node.y - displayR) / VIEWBOX_HEIGHT) * 100;
    const widthPct = ((displayR * 2) / VIEWBOX_WIDTH) * 100;
    const heightPct = ((displayR * 2) / VIEWBOX_HEIGHT) * 100;

    const isLarge = node.r >= 52;
    const isMedium = node.r >= 40 && !isLarge;
    const isSmall = node.r >= 24 && !isMedium && !isLarge;

    const posStyle = {
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
    };

    if (!isLarge && !isMedium && !isSmall) {
        return (
            <div
                onClick={() => node.interactive && setActiveRootPath(node.path)}
                onMouseEnter={() => onHoverChange(node.path)}
                className={`absolute flex cursor-pointer items-center justify-center rounded-full border transition-all duration-300 ease-out ${selected
                    ? 'border-white bg-white/30 shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                    : hovered
                        ? 'border-white/50 bg-white/20 scale-105 shadow-xl backdrop-blur-md z-20'
                        : 'border-white/20 bg-white/5 shadow-sm backdrop-blur-sm z-10'
                    }`}
                style={{
                    ...posStyle,
                    backgroundColor: node.kind === 'other' ? 'rgba(0,0,0,0.2)' : undefined,
                }}
            />
        );
    }

    const showIcon = node.r >= 26;
    const nameFontSize = Math.max(10, Math.min(20, node.r * 0.18));
    const sizeFontSize = Math.max(8.5, Math.min(13, node.r * 0.125));

    return (
        <div
            onClick={() => node.interactive && setActiveRootPath(node.path)}
            onMouseEnter={() => onHoverChange(node.path)}
            className={`absolute flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-full border text-center transition-all duration-300 ease-out ${selected
                ? 'border-white bg-white/30 shadow-[0_0_20px_rgba(255,255,255,0.4)] z-30'
                : hovered
                    ? 'border-white/50 bg-white/20 scale-[1.03] shadow-2xl backdrop-blur-md z-30'
                    : 'border-white/20 bg-white/10 shadow-lg backdrop-blur-sm z-20 hover:bg-white/15'
                }`}
            style={{
                ...posStyle,
                backgroundColor: node.kind === 'other' ? 'rgba(0,0,0,0.3)' : undefined,
                color: node.text || 'white',
                boxShadow: hovered && !selected ? '0 10px 40px -10px rgba(0,0,0,0.5)' : undefined,
            }}
        >
            <div className="flex flex-col items-center justify-center w-[85%] h-[85%] px-1.5">
                {showIcon && (
                    <div className="mb-2 flex items-center justify-center">
                        <NativeFileIcon
                            path={node.path}
                            name={node.name}
                            kind={node.kind}
                            style={{
                                width: `${Math.max(24, node.r * 0.85)}px`,
                                height: `${Math.max(20, node.r * 0.7)}px`,
                            }}
                        />
                    </div>
                )}
                <span
                    className="w-full truncate font-semibold tracking-tight text-white drop-shadow-md"
                    style={{ fontSize: `${nameFontSize}px`, lineHeight: '1.2' }}
                >
                    {node.name}
                </span>
                {node.r >= 32 && (
                    <span
                        className="mt-0.5 w-full truncate font-medium text-white/70"
                        style={{ fontSize: `${sizeFontSize}px` }}
                    >
                        {formatBytes(node.size)}
                    </span>
                )}
            </div>
        </div>
    );
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
                {circleNodes.map((node) => (
                    <BubbleNode
                        key={node.path}
                        node={node}
                        selected={selectedPaths.has(node.path)}
                        hovered={hoveredPath === node.path}
                        VIEWBOX_WIDTH={VIEWBOX_WIDTH}
                        VIEWBOX_HEIGHT={VIEWBOX_HEIGHT}
                        setActiveRootPath={setActiveRootPath}
                        onHoverChange={onHoverChange}
                    />
                ))}

                {/* Hover Tooltip Overlay */}
                {hoveredNode && (() => {
                    const maxR = Math.min(VIEWBOX_WIDTH, VIEWBOX_HEIGHT) * 0.35;
                    const displayR = hoveredNode.r > maxR ? maxR : hoveredNode.r;

                    // Calculate positional pct
                    const leftPct = ((hoveredNode.x) / VIEWBOX_WIDTH) * 100;
                    const topPct = ((hoveredNode.y - displayR) / VIEWBOX_HEIGHT) * 100;

                    // If the node is very close to the top edge (e.g. < 15%), we flip the tooltip to render below the bubble
                    const isNearTop = topPct < 15;

                    const clampedLeft = Math.min(Math.max(leftPct, 10), 90);
                    const finalTop = isNearTop
                        ? ((hoveredNode.y + displayR) / VIEWBOX_HEIGHT) * 100
                        : topPct;

                    const transform = isNearTop ? 'translate(-50%, 15px)' : 'translate(-50%, -100%)';
                    const marginTop = isNearTop ? '0' : '-15px';

                    return (
                        <div
                            className="pointer-events-none absolute z-50 flex w-56 flex-col gap-[2px] rounded-xl border border-white/10 bg-black/75 px-3 py-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-[opacity,transform] duration-200"
                            style={{
                                left: `${clampedLeft}%`,
                                top: `${finalTop}%`,
                                transform,
                                marginTop,
                            }}
                        >
                            <h4 className="truncate text-[13px] font-semibold text-white/95">{hoveredNode.name}</h4>
                            <div className="flex items-center justify-between text-[11px] font-medium text-white/50">
                                <span>{hoveredNode.kind === 'other' ? 'Grouped in view' : 'Folder'}</span>
                                <span className="font-mono text-fuchsia-300">{formatBytes(hoveredNode.size)}</span>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
