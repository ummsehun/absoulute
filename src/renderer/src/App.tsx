import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, pack, treemap } from "d3-hierarchy";
import type {
  AggDelta,
  AppError,
  ScanProgressBatch,
  SystemInfo,
  WindowState,
} from "../../types/contracts";
import type { ElectronAPI } from "../../types/electron-api";

const MAP_WIDTH = 920;
const MAP_HEIGHT = 520;
const VISUAL_COMMIT_INTERVAL_MS = 300;
const VISUAL_DELTA_BURST = 3000;
const MAX_VISUAL_NODE_COUNT = 2800;
const MAX_RENDER_STATE_NODES = 18000;
const TARGET_RENDER_STATE_NODES = 12000;

type LayoutMode = "circle_pack" | "treemap";

interface VizTreeNode {
  path: string;
  name: string;
  size: number;
  selfSize: number;
  children: VizTreeNode[];
}

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

function App() {
  const electronAPI = getElectronAPI();
  const [rootPath, setRootPath] = useState<string>(".");
  const [scanId, setScanId] = useState<string>("");
  const [allowProtectedOptIn, setAllowProtectedOptIn] = useState<boolean>(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [windowState, setWindowState] = useState<WindowState | null>(null);
  const [progress, setProgress] = useState<ScanProgressBatch | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [warningSummary, setWarningSummary] = useState<{
    permission: number;
    io: number;
    lastPath: string | null;
  }>({
    permission: 0,
    io: 0,
    lastPath: null,
  });
  const [aggregateSizes, setAggregateSizes] = useState<Record<string, number>>({});
  const [patchStats, setPatchStats] = useState<{
    added: number;
    updated: number;
    pruned: number;
  }>({
    added: 0,
    updated: 0,
    pruned: 0,
  });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("circle_pack");
  const [scanBasePath, setScanBasePath] = useState<string>("");
  const [activeRootPath, setActiveRootPath] = useState<string>("");
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const apiReady = Boolean(electronAPI);
  const aggregateRef = useRef<Record<string, number>>({});
  const pendingDeltasRef = useRef<AggDelta[]>([]);
  const lastVisualCommitRef = useRef<number>(Date.now());
  const scanBasePathRef = useRef<string>("");
  const activeRootPathRef = useRef<string>("");
  const rootPathRef = useRef<string>(".");

  useEffect(() => {
    scanBasePathRef.current = scanBasePath;
    activeRootPathRef.current = activeRootPath;
    rootPathRef.current = rootPath;
  }, [scanBasePath, activeRootPath, rootPath]);

  useEffect(() => {
    if (!electronAPI) {
      setError({
        code: "E_IO",
        message: "preload bridge is unavailable",
        recoverable: false,
      });
      return;
    }

    void (async () => {
      const defaultRootResult = await electronAPI.getDefaultScanRoot();
      if (defaultRootResult.ok) {
        const normalized = normalizeFsPath(defaultRootResult.data.path);
        if (normalized) {
          setRootPath(normalized);
        }
      }

      const stateResult = await electronAPI.getWindowState();
      if (stateResult.ok) {
        setWindowState(stateResult.data);
      }
    })();

    const unsubscribeWindowState = electronAPI.onWindowStateChanged((state) => {
      setWindowState(state);
    });

    const unsubscribeProgress = electronAPI.onScanProgressBatch((batch) => {
      setProgress(batch);
      if (batch.deltas.length > 0) {
        pendingDeltasRef.current.push(...batch.deltas);
      }

      const now = Date.now();
      const isNonWalkingPhase = batch.progress.phase !== "walking";
      const reachedVisualInterval =
        now - lastVisualCommitRef.current >= VISUAL_COMMIT_INTERVAL_MS;
      const reachedDeltaBurst = pendingDeltasRef.current.length >= VISUAL_DELTA_BURST;

      if (
        pendingDeltasRef.current.length > 0 &&
        (isNonWalkingPhase || reachedVisualInterval || reachedDeltaBurst)
      ) {
        applyDeltasInPlace(aggregateRef.current, pendingDeltasRef.current);
        pruneAggregateStateInPlace(
          aggregateRef.current,
          scanBasePathRef.current || normalizeFsPath(rootPathRef.current),
          activeRootPathRef.current ||
          scanBasePathRef.current ||
          normalizeFsPath(rootPathRef.current),
        );
        pendingDeltasRef.current.length = 0;
        setAggregateSizes({ ...aggregateRef.current });
        lastVisualCommitRef.current = now;
      }

      const patch = batch.patches[0];
      if (patch) {
        setPatchStats((prev) => ({
          added: prev.added + patch.nodesAdded.length,
          updated: prev.updated + patch.nodesUpdated.length,
          pruned: prev.pruned + patch.nodesPruned.length,
        }));
      }
    });

    const unsubscribeError = electronAPI.onScanError((err) => {
      if (err.recoverable) {
        const lastPath = getErrorTargetPath(err);
        setWarningSummary((prev) => ({
          permission: prev.permission + (err.code === "E_PERMISSION" ? 1 : 0),
          io: prev.io + (err.code === "E_IO" ? 1 : 0),
          lastPath: lastPath ?? prev.lastPath,
        }));
        return;
      }

      setError(err);
    });

    return () => {
      unsubscribeWindowState();
      unsubscribeProgress();
      unsubscribeError();
    };
  }, [electronAPI]);

  const visualizationRoot =
    activeRootPath || scanBasePath || normalizeFsPath(rootPath);

  const circleNodes = useMemo(() => {
    if (layoutMode !== "circle_pack") {
      return [];
    }

    const tree = buildVizTree(aggregateSizes, visualizationRoot);
    if (!tree) {
      return [];
    }

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
    if (layoutMode !== "treemap") {
      return [];
    }

    const tree = buildVizTree(aggregateSizes, visualizationRoot);
    if (!tree) {
      return [];
    }

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

  const breadcrumbPaths = useMemo(() => {
    return buildBreadcrumbPaths(scanBasePath || normalizeFsPath(rootPath), visualizationRoot);
  }, [rootPath, scanBasePath, visualizationRoot]);

  const focusedTopItems = useMemo(() => {
    return getTopItemsForPath(aggregateSizes, visualizationRoot, 12);
  }, [aggregateSizes, visualizationRoot]);

  const loadSystemInfo = async () => {
    if (!electronAPI) {
      return;
    }

    const result = await electronAPI.getSystemInfo();
    if (result.ok) {
      setSystemInfo(result.data);
      setError(null);
      return;
    }

    setError(result.error);
  };

  const startScanForPath = async (nextRootPath: string) => {
    if (!electronAPI) {
      return;
    }

    const normalizedRoot = normalizeFsPath(nextRootPath);
    if (!normalizedRoot) {
      setError({
        code: "E_VALIDATION",
        message: "Root path is empty",
        recoverable: true,
      });
      return;
    }

    const result = await electronAPI.scanStart({
      rootPath: normalizedRoot,
      optInProtected: allowProtectedOptIn,
    });

    if (result.ok) {
      setScanId(result.data.scanId);
      setScanStartedAt(result.data.startedAt);
      setRootPath(normalizedRoot);
      setScanBasePath(normalizedRoot);
      setActiveRootPath(normalizedRoot);
      setProgress(null);
      aggregateRef.current = {};
      pendingDeltasRef.current = [];
      lastVisualCommitRef.current = Date.now();
      setAggregateSizes({});
      setPatchStats({ added: 0, updated: 0, pruned: 0 });
      setWarningSummary({ permission: 0, io: 0, lastPath: null });
      setError(null);
      return;
    }

    setError(result.error);
  };

  const startScan = async () => {
    await startScanForPath(rootPath);
  };

  const oneClickScan = async () => {
    await startScanForPath(rootPath);
  };

  const scanTopRoot = async () => {
    await startScanForPath(getTopRootPath(rootPath));
  };

  const cancelScan = async () => {
    if (!scanId || !electronAPI) {
      return;
    }

    const result = await electronAPI.scanCancel(scanId);
    if (result.ok) {
      setScanId("");
      setScanStartedAt(null);
      return;
    }

    setError(result.error);
  };

  const pauseScan = async () => {
    if (!scanId || !electronAPI) {
      return;
    }

    const result = await electronAPI.scanPause(scanId);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (!result.data.ok) {
      setError({
        code: "E_IO",
        message: "Pause request was not accepted",
        recoverable: true,
      });
    }
  };

  const resumeScan = async () => {
    if (!scanId || !electronAPI) {
      return;
    }

    const result = await electronAPI.scanResume(scanId);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (!result.data.ok) {
      setError({
        code: "E_IO",
        message: "Resume request was not accepted",
        recoverable: true,
      });
    }
  };

  const minimizeWindow = async () => {
    if (!electronAPI) {
      return;
    }

    const result = await electronAPI.minimizeWindow();
    if (!result.ok) {
      setError(result.error);
    }
  };

  const toggleMaximizeWindow = async () => {
    if (!electronAPI) {
      return;
    }

    const result = await electronAPI.toggleMaximizeWindow();
    if (!result.ok) {
      setError(result.error);
    }
  };

  const closeWindow = async () => {
    if (!electronAPI) {
      return;
    }

    const result = await electronAPI.closeWindow();
    if (!result.ok) {
      setError(result.error);
    }
  };

  return (
    <main className="app-shell">
      <header className="window-toolbar panel">
        <div>
          <h1>Space Lens Explorer</h1>
          <p className="window-state-text">
            큰 버블일수록 더 큰 용량을 차지합니다. 버블을 클릭하면 바로 들어갑니다.
          </p>
        </div>
        <div className="actions">
          <button onClick={minimizeWindow} disabled={!apiReady}>
            Minimize
          </button>
          <button onClick={toggleMaximizeWindow} disabled={!apiReady}>
            Maximize/Restore
          </button>
          <button onClick={closeWindow} disabled={!apiReady}>
            Close
          </button>
        </div>
      </header>

      <section className="panel">
        <h2>원클릭 스캔</h2>
        <p className="section-subtext">
          기본 경로를 자동으로 불러오고, 한 번의 클릭으로 바로 분석을 시작합니다.
        </p>
        <label htmlFor="rootPath">Root Path</label>
        <input
          id="rootPath"
          value={rootPath}
          onChange={(event) => setRootPath(event.target.value)}
        />

        <label className="optin-toggle" htmlFor="optInProtected">
          <input
            id="optInProtected"
            type="checkbox"
            checked={allowProtectedOptIn}
            onChange={(event) => setAllowProtectedOptIn(event.target.checked)}
          />
          기본 차단 경로(예: Applications/Library, Program Files) 스캔 허용
        </label>

        <div className="actions">
          <button onClick={oneClickScan} disabled={!apiReady} className="primary-action">
            원클릭 스캔 시작
          </button>
          <button onClick={scanTopRoot} disabled={!apiReady}>
            최상단 루트 스캔
          </button>
          <button onClick={startScan} disabled={!apiReady}>
            Start
          </button>
          <button onClick={pauseScan} disabled={!scanId || !apiReady}>
            Pause
          </button>
          <button onClick={resumeScan} disabled={!scanId || !apiReady}>
            Resume
          </button>
          <button onClick={cancelScan} disabled={!scanId || !apiReady}>
            Cancel
          </button>
        </div>
        <p className="scan-meta">
          scanId: {scanId || "-"} | phase: {progress?.progress.phase ?? "-"} | speed:{" "}
          {formatScanSpeed(progress?.progress.scannedCount ?? 0, scanStartedAt)}
        </p>
        {(warningSummary.permission > 0 || warningSummary.io > 0) && (
          <div className="warning-box">
            <strong>일부 경로는 접근 권한으로 인해 건너뛰었습니다.</strong>
            <p>
              permission: {warningSummary.permission} / io: {warningSummary.io}
            </p>
            {warningSummary.lastPath ? (
              <p className="warning-path">{warningSummary.lastPath}</p>
            ) : null}
          </div>
        )}
      </section>

      <section className="workspace-grid">
        <article className="panel map-panel">
          <div className="panel-header-row">
            <h2>Disk Map</h2>
            <div className="layout-switch">
              <button
                type="button"
                className={layoutMode === "circle_pack" ? "is-active" : ""}
                onClick={() => setLayoutMode("circle_pack")}
              >
                Circle Pack
              </button>
              <button
                type="button"
                className={layoutMode === "treemap" ? "is-active" : ""}
                onClick={() => setLayoutMode("treemap")}
              >
                Treemap
              </button>
            </div>
          </div>

          <div className="breadcrumb">
            {breadcrumbPaths.length === 0 ? (
              <span className="crumb">-</span>
            ) : (
              breadcrumbPaths.map((pathItem, index) => (
                <button
                  key={`${pathItem}-${index}`}
                  type="button"
                  className={`crumb ${pathItem === visualizationRoot ? "is-current" : ""}`}
                  onClick={() => setActiveRootPath(pathItem)}
                >
                  {labelFromPath(pathItem)}
                </button>
              ))
            )}
            <button
              type="button"
              className="crumb reset-crumb"
              onClick={() => setActiveRootPath(scanBasePath || normalizeFsPath(rootPath))}
            >
              전체 보기
            </button>
          </div>

          {layoutMode === "circle_pack" ? (
            circleNodes.length === 0 ? (
              <p>No aggregated nodes yet</p>
            ) : (
              <svg
                className="disk-map"
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                role="img"
                aria-label="Circle packing disk map"
              >
                {circleNodes.map((node) => (
                  <g
                    key={`circle-${node.path}`}
                    className="map-node"
                    onClick={() => setActiveRootPath(node.path)}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r}
                      fill={nodeColor(node.depth, node.path)}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                    {node.r > 26 ? (
                      <text x={node.x} y={node.y} textAnchor="middle" className="disk-map-label">
                        {truncateLabel(node.name, Math.floor(node.r / 4))}
                      </text>
                    ) : null}
                    <title>{`${node.path}\n${formatBytes(node.size)}`}</title>
                  </g>
                ))}
              </svg>
            )
          ) : rectNodes.length === 0 ? (
            <p>No aggregated nodes yet</p>
          ) : (
            <svg
              className="disk-map"
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              role="img"
              aria-label="Treemap disk map"
            >
              {rectNodes.map((node) => {
                const width = Math.max(node.x1 - node.x0, 0);
                const height = Math.max(node.y1 - node.y0, 0);

                return (
                  <g
                    key={`rect-${node.path}`}
                    className="map-node"
                    onClick={() => setActiveRootPath(node.path)}
                  >
                    <rect
                      x={node.x0}
                      y={node.y0}
                      width={width}
                      height={height}
                      fill={nodeColor(node.depth, node.path)}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                    {width > 90 && height > 28 ? (
                      <text
                        x={node.x0 + 8}
                        y={node.y0 + 18}
                        textAnchor="start"
                        className="disk-map-label disk-map-label-left"
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
        </article>

        <aside className="panel side-panel">
          <h2>Top Items</h2>
          {focusedTopItems.length === 0 ? (
            <p>No ranked items yet</p>
          ) : (
            <ol className="top-list">
              {focusedTopItems.map(([nodePath, size], index) => (
                <li key={`top-${nodePath}-${index}`}>
                  <button
                    type="button"
                    className="top-item-button"
                    onClick={() => setActiveRootPath(nodePath)}
                  >
                    <span className="top-list-label">{nodePath}</span>
                  </button>
                  <strong>{formatBytes(size)}</strong>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </section>

      {error && (
        <section className="panel error">
          <h2>Error</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </section>
      )}

      <details className="panel debug-panel">
        <summary>개발 정보</summary>
        <div className="debug-grid">
          <section>
            <h3>System Info</h3>
            <button onClick={loadSystemInfo} disabled={!apiReady}>
              Load System Info
            </button>
            {systemInfo ? (
              <p>
                {systemInfo.platform} / {systemInfo.arch} / {systemInfo.release}
              </p>
            ) : (
              <p>Not loaded</p>
            )}
          </section>
          <section>
            <h3>Progress</h3>
            {progress ? (
              <pre>{JSON.stringify(progress.progress, null, 2)}</pre>
            ) : (
              <p>No progress yet</p>
            )}
          </section>
          <section>
            <h3>Patch Stats</h3>
            <p>added: {patchStats.added}</p>
            <p>updated: {patchStats.updated}</p>
            <p>pruned: {patchStats.pruned}</p>
            <p>bridge: {apiReady ? "ready" : "missing"}</p>
            {windowState ? (
              <p>
                focused={windowState.isFocused} / maximized={windowState.isMaximized} /
                minimized={windowState.isMinimized}
              </p>
            ) : null}
          </section>
        </div>
      </details>
    </main>
  );
}

function getElectronAPI(): ElectronAPI | null {
  return (window as Window & { electronAPI?: ElectronAPI }).electronAPI ?? null;
}

function applyDeltasInPlace(
  target: Record<string, number>,
  deltas: AggDelta[],
): void {
  for (const delta of deltas) {
    const prevSize = target[delta.nodePath] ?? 0;
    target[delta.nodePath] = Math.max(prevSize + delta.sizeDelta, 0);
  }
}

function getErrorTargetPath(error: AppError): string | null {
  if (!error.details) {
    return null;
  }

  const candidate = error.details.targetPath;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function formatScanSpeed(scannedCount: number, startedAt: number | null): string {
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

function getTopItemsForPath(
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
      !isSameOrChildPath(nodePath, normalizedFocusPath)
    ) {
      continue;
    }

    pushTopN(top, [nodePath, size], limit);
  }

  return top.sort((a, b) => b[1] - a[1]);
}

function getTopRootPath(inputPath: string): string {
  const normalized = normalizeFsPath(inputPath);
  if (/^[a-z]:\//i.test(normalized)) {
    return normalized.slice(0, 3);
  }

  return "/";
}

function pruneAggregateStateInPlace(
  target: Record<string, number>,
  basePath: string,
  focusPath: string,
): void {
  const keys = Object.keys(target);
  if (keys.length <= MAX_RENDER_STATE_NODES) {
    return;
  }

  const normalizedBase = normalizeFsPath(basePath) || "/";
  const normalizedFocus = normalizeFsPath(focusPath) || normalizedBase;
  const keepNormalized = new Set<string>();

  addAncestorChain(keepNormalized, normalizedBase);
  addAncestorChain(keepNormalized, normalizedFocus);

  if (!isFilesystemRootPath(normalizedFocus)) {
    for (const rawPath of keys) {
      const normalizedPath = normalizeFsPath(rawPath);
      if (isSameOrChildPath(normalizedPath, normalizedFocus)) {
        keepNormalized.add(normalizedPath);
      }
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

    pushTopN(topCandidates, [normalizedPath, size], TARGET_RENDER_STATE_NODES);
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

function addAncestorChain(target: Set<string>, startPath: string): void {
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

function pushTopN(
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

function buildBreadcrumbPaths(basePath: string, currentPath: string): string[] {
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

function labelFromPath(input: string): string {
  const normalized = normalizeFsPath(input);
  if (normalized === "/" || /^[a-z]:\/$/i.test(normalized)) {
    return normalized;
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function nodeColor(depth: number, key: string): string {
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  const hue = (hash + depth * 29) % 360;
  const saturation = 56 + (hash % 14);
  const lightness = Math.max(32, 72 - depth * 7);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function truncateLabel(label: string, maxChars: number): string {
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

function buildVizTree(
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
    .slice(0, MAX_VISUAL_NODE_COUNT)
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

function hydrateDerivedSizes(node: VizTreeNode): number {
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

function normalizeFsPath(rawPath: string): string {
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

function parentPathOf(inputPath: string): string | null {
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

function isSameOrChildPath(candidate: string, base: string): boolean {
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

function isFilesystemRootPath(inputPath: string): boolean {
  const normalized = normalizeFsPath(inputPath);
  return normalized === "/" || /^[a-z]:\/$/i.test(normalized);
}

function formatBytes(bytes: number): string {
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

export default App;
