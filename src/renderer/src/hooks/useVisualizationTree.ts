import { useDeferredValue, useMemo } from 'react';
import { hierarchy, pack } from 'd3-hierarchy';
import { getDisplaySizeForPath, labelFromPath, resolveBubbleTone } from '../utils/helpers';
import type { CircleVizNode, DrilldownBubbleNode, ListRow } from '../components/VisualizationView';

const MAX_VISIBLE_BUBBLES = 8;
const VIEWBOX_WIDTH = 980;
const VIEWBOX_HEIGHT = 760;

interface UseVisualizationTreeProps {
    aggregateSizes: Record<string, number>;
    rootPath: string;
    visualizationRoot: string;
    focusedTopItems: Array<[string, number]>;
}

export function useVisualizationTree({
    aggregateSizes,
    rootPath,
    visualizationRoot,
    focusedTopItems,
}: UseVisualizationTreeProps) {
    const deferredAggregateSizes = useDeferredValue(aggregateSizes);
    const deferredVisualizationRoot = useDeferredValue(visualizationRoot);
    const deferredFocusedTopItems = useDeferredValue(focusedTopItems);

    const isTreePending =
        deferredAggregateSizes !== aggregateSizes ||
        deferredVisualizationRoot !== visualizationRoot ||
        deferredFocusedTopItems !== focusedTopItems;

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

    return {
        isTreePending,
        displayScanRootSize,
        displayVisualizationSize,
        listRows,
        drilldownTree,
        packedTree,
        circleNodes,
        VIEWBOX_WIDTH,
        VIEWBOX_HEIGHT,
    };
}
