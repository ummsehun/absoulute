import Store from "electron-store";
import path from "node:path";

interface ScanCacheNode {
  path: string;
  size: number;
}

interface ScanCacheEntry {
  rootPath: string;
  capturedAt: number;
  nodes: ScanCacheNode[];
}

interface ScanCacheState {
  entries: Record<string, ScanCacheEntry>;
}

const STORE_NAME = "scan-history-cache";
const MAX_ROOT_ENTRIES = 64;
const MAX_NODES_PER_ROOT = 400;

export class ScanHistoryStore {
  private readonly store = new Store<ScanCacheState>({
    name: STORE_NAME,
    clearInvalidConfig: true,
    defaults: {
      entries: {},
    },
  });

  get(rootPath: string): ScanCacheEntry | null {
    const key = normalizeKey(rootPath);
    const entry = this.store.get(`entries.${key}` as const);
    if (!entry || !Array.isArray(entry.nodes)) {
      return null;
    }

    return {
      rootPath: entry.rootPath,
      capturedAt: entry.capturedAt,
      nodes: entry.nodes
        .filter((item) => item && typeof item.path === "string" && typeof item.size === "number")
        .slice(0, MAX_NODES_PER_ROOT)
        .map((item) => ({
          path: item.path,
          size: Math.max(0, Math.floor(item.size)),
        })),
    };
  }

  set(rootPath: string, nodes: ScanCacheNode[]): void {
    const key = normalizeKey(rootPath);
    const dedup = new Map<string, number>();
    for (const node of nodes) {
      if (!node.path || node.size <= 0) {
        continue;
      }
      const previous = dedup.get(node.path) ?? 0;
      dedup.set(node.path, Math.max(previous, node.size));
    }

    const normalizedNodes = [...dedup.entries()]
      .map(([nodePath, size]) => ({ path: nodePath, size }))
      .sort((left, right) => right.size - left.size)
      .slice(0, MAX_NODES_PER_ROOT);

    this.store.set(`entries.${key}` as const, {
      rootPath,
      capturedAt: Date.now(),
      nodes: normalizedNodes,
    });

    this.pruneIfNeeded();
  }

  private pruneIfNeeded(): void {
    const entries = this.store.get("entries");
    const records = Object.entries(entries ?? {});
    if (records.length <= MAX_ROOT_ENTRIES) {
      return;
    }

    records.sort((left, right) => {
      const leftAt = left[1]?.capturedAt ?? 0;
      const rightAt = right[1]?.capturedAt ?? 0;
      return rightAt - leftAt;
    });

    const keep = records.slice(0, MAX_ROOT_ENTRIES);
    const nextEntries: Record<string, ScanCacheEntry> = {};
    for (const [key, value] of keep) {
      nextEntries[key] = value;
    }

    this.store.set("entries", nextEntries);
  }
}

function normalizeKey(rawPath: string): string {
  return path.resolve(rawPath).replace(/[\\/.:]/g, "_");
}
