import path from "node:path";
import type {
  AggDelta,
  CompressedTreePatch,
} from "../../types/contracts";

interface DirectoryStat {
  size: number;
  count: number;
}

export class ScanAggregator {
  private readonly directoryStats = new Map<string, DirectoryStat>();
  private readonly topChildren = new Map<string, Map<string, number>>();

  private readonly pendingAdded = new Set<string>();
  private readonly pendingUpdated = new Set<string>();
  private readonly pendingPruned = new Set<string>();

  private readonly normalizedRoot: string;

  constructor(
    private readonly rootPath: string,
    private readonly topLimit: number,
    private readonly platform: NodeJS.Platform,
  ) {
    this.normalizedRoot = normalizePath(rootPath, platform);
    this.ensureDirectory(rootPath, null);
  }

  ensureDirectory(dirPath: string, parentPath: string | null): void {
    if (!this.isWithinRoot(dirPath)) {
      return;
    }

    const existed = this.directoryStats.has(dirPath);
    if (!existed) {
      this.directoryStats.set(dirPath, { size: 0, count: 0 });
      this.pendingAdded.add(dirPath);
    }

    if (parentPath && this.isWithinRoot(parentPath)) {
      const currentSize = this.directoryStats.get(dirPath)?.size ?? 0;
      this.updateTopChildren(parentPath, dirPath, currentSize);
    }
  }

  addFile(filePath: string, fileSize: number): AggDelta[] {
    const deltas: AggDelta[] = [];
    const ancestors = this.getAncestorDirectories(filePath);

    for (const ancestor of ancestors) {
      const prev = this.directoryStats.get(ancestor);
      if (!prev) {
        this.directoryStats.set(ancestor, { size: fileSize, count: 1 });
        this.pendingAdded.add(ancestor);
      } else {
        prev.size += fileSize;
        prev.count += 1;
        this.pendingUpdated.add(ancestor);
      }

      deltas.push({
        nodePath: ancestor,
        sizeDelta: fileSize,
        countDelta: 1,
      });

      const parentDir = this.getParentWithinRoot(ancestor);
      if (parentDir) {
        const total = this.directoryStats.get(ancestor)?.size ?? 0;
        this.updateTopChildren(parentDir, ancestor, total);
      }
    }

    return deltas;
  }

  addDirectoryEstimate(dirPath: string, estimatedSize: number): AggDelta[] {
    if (!this.isWithinRoot(dirPath) || estimatedSize <= 0) {
      return [];
    }

    const deltas: AggDelta[] = [];
    let current = dirPath;

    while (this.isWithinRoot(current)) {
      const prev = this.directoryStats.get(current);
      if (!prev) {
        this.directoryStats.set(current, { size: estimatedSize, count: 0 });
        this.pendingAdded.add(current);
      } else {
        prev.size += estimatedSize;
        this.pendingUpdated.add(current);
      }

      deltas.push({
        nodePath: current,
        sizeDelta: estimatedSize,
        countDelta: 0,
      });

      const parent = this.getParentWithinRoot(current);
      if (!parent) {
        break;
      }

      const total = this.directoryStats.get(current)?.size ?? 0;
      this.updateTopChildren(parent, current, total);
      current = parent;
    }

    return deltas;
  }

  hasPendingPatch(): boolean {
    return (
      this.pendingAdded.size > 0 ||
      this.pendingUpdated.size > 0 ||
      this.pendingPruned.size > 0
    );
  }

  consumePatch(): CompressedTreePatch | null {
    if (!this.hasPendingPatch()) {
      return null;
    }

    const patch: CompressedTreePatch = {
      nodesAdded: sortStrings(this.pendingAdded),
      nodesUpdated: sortStrings(this.pendingUpdated),
      nodesPruned: sortStrings(this.pendingPruned),
    };

    this.pendingAdded.clear();
    this.pendingUpdated.clear();
    this.pendingPruned.clear();

    return patch;
  }

  getDirectorySize(dirPath: string): number {
    return this.directoryStats.get(dirPath)?.size ?? 0;
  }

  private getAncestorDirectories(filePath: string): string[] {
    const ancestors: string[] = [];
    let current = path.dirname(filePath);

    while (this.isWithinRoot(current)) {
      ancestors.push(current);

      if (this.isSamePath(current, this.rootPath)) {
        break;
      }

      const parent = path.dirname(current);
      if (this.isSamePath(parent, current)) {
        break;
      }

      current = parent;
    }

    return ancestors;
  }

  private getParentWithinRoot(dirPath: string): string | null {
    if (this.isSamePath(dirPath, this.rootPath)) {
      return null;
    }

    const parent = path.dirname(dirPath);
    return this.isWithinRoot(parent) ? parent : null;
  }

  private updateTopChildren(
    parentPath: string,
    childPath: string,
    childSize: number,
  ): void {
    const children = this.topChildren.get(parentPath) ?? new Map<string, number>();
    const existingSize = children.get(childPath);
    if (existingSize !== undefined) {
      children.set(childPath, childSize);
      this.topChildren.set(parentPath, children);
      return;
    }

    if (children.size < this.topLimit) {
      children.set(childPath, childSize);
      this.topChildren.set(parentPath, children);
      return;
    }

    let smallestKey: string | null = null;
    let smallestSize = Number.POSITIVE_INFINITY;
    for (const [key, size] of children) {
      if (size < smallestSize) {
        smallestSize = size;
        smallestKey = key;
      }
    }

    if (!smallestKey || childSize <= smallestSize) {
      this.topChildren.set(parentPath, children);
      return;
    }

    children.delete(smallestKey);
    this.pendingPruned.add(smallestKey);
    children.set(childPath, childSize);
    this.topChildren.set(parentPath, children);
  }

  private isWithinRoot(targetPath: string): boolean {
    const normalizedTarget = normalizePath(targetPath, this.platform);
    return (
      normalizedTarget === this.normalizedRoot ||
      normalizedTarget.startsWith(`${this.normalizedRoot}/`)
    );
  }

  private isSamePath(left: string, right: string): boolean {
    return normalizePath(left, this.platform) === normalizePath(right, this.platform);
  }
}

function normalizePath(rawPath: string, platform: NodeJS.Platform): string {
  const normalized = rawPath.replace(/\\/g, "/");
  const trimmed = normalized.replace(/\/+$/, "");
  const rootSafe = trimmed === "" ? "/" : trimmed;
  if (platform === "win32") {
    return rootSafe.toLowerCase();
  }

  return rootSafe;
}

function sortStrings(values: Set<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}
