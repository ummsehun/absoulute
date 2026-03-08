import type { AggDelta, AppError } from "../../../types/contracts";

export const MAP_WIDTH = 920;
export const MAP_HEIGHT = 520;
export const VISUAL_COMMIT_INTERVAL_MS = 300;
export const VISUAL_DELTA_BURST = 3000;
const MAX_VISUAL_NODE_COUNT = 1600;
const MAX_VISUAL_NODE_COUNT_SHALLOW = 900;
const MAX_VISUAL_NODE_COUNT_ROOT = 600;
const MAX_RENDER_STATE_NODES = 12000;
const MAX_RENDER_STATE_NODES_SHALLOW = 7000;
const MAX_RENDER_STATE_NODES_ROOT = 4000;
const TARGET_RENDER_STATE_NODES = 7000;
const TARGET_RENDER_STATE_NODES_SHALLOW = 4200;
const TARGET_RENDER_STATE_NODES_ROOT = 2200;

export interface VizTreeNode {
    path: string;
    name: string;
    size: number;
    selfSize: number;
    children: VizTreeNode[];
}

export function applyDeltasInPlace(
    target: Record<string, number>,
    deltas: AggDelta[],
): void {
    for (const delta of deltas) {
        const prevSize = target[delta.nodePath] ?? 0;
        target[delta.nodePath] = Math.max(prevSize + delta.sizeDelta, 0);
    }
}

export function getErrorTargetPath(error: AppError): string | null {
    if (!error.details) {
        return null;
    }

    const candidate = error.details.targetPath;
    return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

export function formatScanSpeed(scannedCount: number, startedAt: number | null): string {
    if (!startedAt || scannedCount <= 0) {
        return "-";
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs <= 0) {
        return "-";
    }

    const perSecond = scannedCount / (elapsedMs / 1000);
    if (!Number.isFinite(perSecond) || perSecond <= 0) {
        return "-";
    }

    return `${Math.round(perSecond).toLocaleString()} files/s`;
}

export function getTopItemsForPath(
    aggregateSizes: Record<string, number>,
    focusPath: string,
    limit: number,
): Array<[string, number]> {
    const normalizedFocusPath = normalizeFsPath(focusPath);
    if (!normalizedFocusPath) {
        return [];
    }

    const top: Array<[string, number]> = [];
    for (const [rawPath, size] of Object.entries(aggregateSizes)) {
        if (size <= 0) {
            continue;
        }

        const nodePath = normalizeFsPath(rawPath);
        if (
            nodePath === normalizedFocusPath ||
            !isSameOrChildPath(nodePath, normalizedFocusPath) ||
            parentPathOf(nodePath) !== normalizedFocusPath
        ) {
            continue;
        }

        pushTopN(top, [nodePath, size], limit);
    }

    return top.sort((a, b) => b[1] - a[1]);
}

export function getTopRootPath(inputPath: string): string {
    const normalized = normalizeFsPath(inputPath);
    if (/^[a-z]:\//i.test(normalized)) {
        return normalized.slice(0, 3);
    }

    return "/";
}

export function pruneAggregateStateInPlace(
    target: Record<string, number>,
    basePath: string,
    focusPath: string,
): void {
    const keys = Object.keys(target);
    const maxNodeCount = resolveRenderStateLimit(basePath);
    if (keys.length <= maxNodeCount) {
        return;
    }

    const normalizedBase = normalizeFsPath(basePath) || "/";
    const normalizedFocus = normalizeFsPath(focusPath) || normalizedBase;
    const targetNodeCount = resolveRenderStateTarget(basePath);
    const keepNormalized = new Set<string>();

    addAncestorChain(keepNormalized, normalizedBase);
    addAncestorChain(keepNormalized, normalizedFocus);

    for (const rawPath of keys) {
        const normalizedPath = normalizeFsPath(rawPath);
        if (parentPathOf(normalizedPath) === normalizedFocus) {
            keepNormalized.add(normalizedPath);
            continue;
        }

        if (
            !isFilesystemRootPath(normalizedFocus) &&
            isSameOrChildPath(normalizedPath, normalizedFocus)
        ) {
            keepNormalized.add(normalizedPath);
        }
    }

    const topCandidates: Array<[string, number]> = [];
    for (const rawPath of keys) {
        const normalizedPath = normalizeFsPath(rawPath);
        if (keepNormalized.has(normalizedPath)) {
            continue;
        }

        const size = target[rawPath];
        if (size <= 0) {
            continue;
        }

        pushTopN(topCandidates, [normalizedPath, size], targetNodeCount);
    }

    for (const [normalizedPath] of topCandidates) {
        keepNormalized.add(normalizedPath);
    }

    for (const rawPath of keys) {
        const normalizedPath = normalizeFsPath(rawPath);
        if (!keepNormalized.has(normalizedPath)) {
            delete target[rawPath];
        }
    }
}

export function addAncestorChain(target: Set<string>, startPath: string): void {
    let cursor = normalizeFsPath(startPath);
    if (!cursor) {
        return;
    }

    while (true) {
        target.add(cursor);
        const parent = parentPathOf(cursor);
        if (!parent) {
            break;
        }
        cursor = parent;
    }
}

export function pushTopN(
    target: Array<[string, number]>,
    entry: [string, number],
    limit: number,
): void {
    if (limit <= 0) {
        return;
    }

    if (target.length < limit) {
        target.push(entry);
        target.sort((a, b) => a[1] - b[1]);
        return;
    }

    if (entry[1] <= target[0][1]) {
        return;
    }

    target[0] = entry;
    target.sort((a, b) => a[1] - b[1]);
}

export function buildBreadcrumbPaths(basePath: string, currentPath: string): string[] {
    const normalizedBase = normalizeFsPath(basePath);
    const normalizedCurrent = normalizeFsPath(currentPath);

    if (!normalizedBase || !normalizedCurrent || !isSameOrChildPath(normalizedCurrent, normalizedBase)) {
        return [];
    }

    const paths = [normalizedCurrent];
    let cursor = normalizedCurrent;

    while (cursor !== normalizedBase) {
        const parent = parentPathOf(cursor);
        if (!parent) {
            break;
        }

        paths.push(parent);
        cursor = parent;
    }

    return paths.reverse();
}

export function labelFromPath(input: string): string {
    const normalized = normalizeFsPath(input);
    if (normalized === "/" || /^[a-z]:\/$/i.test(normalized)) {
        return normalized;
    }

    const segments = normalized.split("/").filter(Boolean);
    return segments.at(-1) ?? normalized;
}

export function nodeColor(depth: number, key: string): string {
    let hash = 0;
    for (const char of key) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    const hue = (hash + depth * 29) % 360;
    const saturation = 56 + (hash % 14);
    const lightness = Math.max(32, 72 - depth * 7);
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function truncateLabel(label: string, maxChars: number): string {
    if (maxChars <= 0) {
        return "";
    }

    if (label.length <= maxChars) {
        return label;
    }

    if (maxChars <= 2) {
        return label.slice(0, maxChars);
    }

    return `${label.slice(0, maxChars - 1)}…`;
}

export function buildVizTree(
    aggregateSizes: Record<string, number>,
    rootPath: string,
): VizTreeNode | null {
    const normalizedRoot = normalizeFsPath(rootPath);
    if (!normalizedRoot) {
        return null;
    }

    const sizeMap = new Map<string, number>();
    for (const [rawPath, rawSize] of Object.entries(aggregateSizes)) {
        if (rawSize <= 0) {
            continue;
        }

        const nodePath = normalizeFsPath(rawPath);
        if (!isSameOrChildPath(nodePath, normalizedRoot)) {
            continue;
        }

        const prev = sizeMap.get(nodePath) ?? 0;
        sizeMap.set(nodePath, Math.max(prev, rawSize));
    }

    if (sizeMap.size === 0) {
        return null;
    }

    const prioritizedPaths = [...sizeMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, resolveVisualNodeLimit(normalizedRoot))
        .map(([nodePath]) => nodePath);
    const prioritizedPathSet = new Set<string>(prioritizedPaths);

    const pathSet = new Set<string>([normalizedRoot]);
    for (const nodePath of prioritizedPathSet) {
        pathSet.add(nodePath);
        let parent = parentPathOf(nodePath);
        while (parent && isSameOrChildPath(parent, normalizedRoot)) {
            pathSet.add(parent);
            if (parent === normalizedRoot) {
                break;
            }
            parent = parentPathOf(parent);
        }
    }

    const sortedPaths = [...pathSet].sort((a, b) => a.length - b.length);
    const nodeMap = new Map<string, VizTreeNode>();

    for (const nodePath of sortedPaths) {
        nodeMap.set(nodePath, {
            path: nodePath,
            name: labelFromPath(nodePath),
            size: sizeMap.get(nodePath) ?? 0,
            selfSize: 0,
            children: [],
        });
    }

    for (const nodePath of sortedPaths) {
        if (nodePath === normalizedRoot) {
            continue;
        }

        const parentPath = parentPathOf(nodePath);
        if (!parentPath) {
            continue;
        }

        const parent = nodeMap.get(parentPath);
        const child = nodeMap.get(nodePath);
        if (parent && child) {
            parent.children.push(child);
        }
    }

    const root = nodeMap.get(normalizedRoot);
    if (!root) {
        return null;
    }

    hydrateDerivedSizes(root);
    return root;
}

export function hydrateDerivedSizes(node: VizTreeNode): number {
    let childrenTotal = 0;

    for (const child of node.children) {
        childrenTotal += hydrateDerivedSizes(child);
    }

    if (node.size < childrenTotal) {
        node.size = childrenTotal;
    }

    node.selfSize =
        node.children.length === 0 ? Math.max(node.size, 0) : Math.max(node.size - childrenTotal, 0);

    node.children.sort((a, b) => b.size - a.size);
    return node.size;
}

export function getDisplaySizeForPath(
    aggregateSizes: Record<string, number>,
    rootPath: string,
): number {
    const tree = buildVizTree(aggregateSizes, rootPath);
    if (tree) {
        return tree.size;
    }

    const normalizedRoot = normalizeFsPath(rootPath);
    if (!normalizedRoot) {
        return 0;
    }

    return aggregateSizes[normalizedRoot] ?? 0;
}

export function normalizeFsPath(rawPath: string): string {
    const trimmed = rawPath.trim();
    if (!trimmed) {
        return "";
    }

    const slashNormalized = trimmed.replace(/\\/g, "/");
    if (/^[a-z]:\/?$/i.test(slashNormalized)) {
        return `${slashNormalized.slice(0, 2).toLowerCase()}/`;
    }

    if (slashNormalized === "/") {
        return "/";
    }

    const noTrailing = slashNormalized.replace(/\/+$/, "");
    if (/^[a-z]:/i.test(noTrailing)) {
        return `${noTrailing.slice(0, 1).toLowerCase()}${noTrailing.slice(1)}`;
    }

    return noTrailing || "/";
}

export function parentPathOf(inputPath: string): string | null {
    const normalized = normalizeFsPath(inputPath);

    if (!normalized || normalized === "/" || /^[a-z]:\/$/i.test(normalized)) {
        return null;
    }

    const index = normalized.lastIndexOf("/");
    if (index < 0) {
        return null;
    }

    if (index === 0) {
        return "/";
    }

    const candidate = normalized.slice(0, index);
    if (/^[a-z]:$/i.test(candidate)) {
        return `${candidate.toLowerCase()}/`;
    }

    return candidate;
}

export function isSameOrChildPath(candidate: string, base: string): boolean {
    const normalizedCandidate = normalizeFsPath(candidate);
    const normalizedBase = normalizeFsPath(base);

    if (!normalizedCandidate || !normalizedBase) {
        return false;
    }

    if (normalizedCandidate === normalizedBase) {
        return true;
    }

    if (normalizedBase === "/") {
        return normalizedCandidate.startsWith("/");
    }

    if (/^[a-z]:\/$/i.test(normalizedBase)) {
        return normalizedCandidate.startsWith(normalizedBase);
    }

    return normalizedCandidate.startsWith(`${normalizedBase}/`);
}

function resolveVisualNodeLimit(rootPath: string): number {
    if (isFilesystemRootPath(rootPath)) {
        return MAX_VISUAL_NODE_COUNT_ROOT;
    }

    if (pathDepth(rootPath) <= 2) {
        return MAX_VISUAL_NODE_COUNT_SHALLOW;
    }

    return MAX_VISUAL_NODE_COUNT;
}

function resolveRenderStateLimit(rootPath: string): number {
    const normalized = normalizeFsPath(rootPath);
    if (isFilesystemRootPath(normalized)) {
        return MAX_RENDER_STATE_NODES_ROOT;
    }

    if (pathDepth(normalized) <= 2) {
        return MAX_RENDER_STATE_NODES_SHALLOW;
    }

    return MAX_RENDER_STATE_NODES;
}

function resolveRenderStateTarget(rootPath: string): number {
    const normalized = normalizeFsPath(rootPath);
    if (isFilesystemRootPath(normalized)) {
        return TARGET_RENDER_STATE_NODES_ROOT;
    }

    if (pathDepth(normalized) <= 2) {
        return TARGET_RENDER_STATE_NODES_SHALLOW;
    }

    return TARGET_RENDER_STATE_NODES;
}

function pathDepth(inputPath: string): number {
    const normalized = normalizeFsPath(inputPath);
    if (!normalized || normalized === "/") {
        return 0;
    }

    if (/^[a-z]:\/$/i.test(normalized)) {
        return 1;
    }

    return normalized.split("/").filter(Boolean).length;
}

export function isFilesystemRootPath(inputPath: string): boolean {
    const normalized = normalizeFsPath(inputPath);
    return normalized === "/" || /^[a-z]:\/$/i.test(normalized);
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );
    const value = bytes / 1024 ** exponent;
    return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

const BUBBLE_PALETTE = [
    { fill: 'rgba(182, 124, 255, 0.52)', stroke: 'rgba(233, 206, 255, 0.82)', text: 'rgba(255, 245, 255, 0.94)' },
    { fill: 'rgba(140, 175, 255, 0.5)', stroke: 'rgba(206, 221, 255, 0.82)', text: 'rgba(247, 249, 255, 0.94)' },
    { fill: 'rgba(219, 131, 255, 0.48)', stroke: 'rgba(248, 210, 255, 0.8)', text: 'rgba(255, 245, 255, 0.92)' },
    { fill: 'rgba(124, 214, 255, 0.46)', stroke: 'rgba(203, 237, 255, 0.8)', text: 'rgba(243, 252, 255, 0.92)' },
    { fill: 'rgba(128, 153, 255, 0.48)', stroke: 'rgba(204, 214, 255, 0.8)', text: 'rgba(245, 247, 255, 0.92)' },
] as const;

export function resolveBubbleTone(key: string) {
    let hash = 0;
    for (const char of key) {
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    return BUBBLE_PALETTE[hash % BUBBLE_PALETTE.length];
}

export function formatCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}
