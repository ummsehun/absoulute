import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  AggDelta,
  AppError,
  ScanProgressBatch,
  SystemInfo,
} from "../../types/contracts";

function App() {
  const [rootPath, setRootPath] = useState<string>(".");
  const [scanId, setScanId] = useState<string>("");
  const [allowProtectedOptIn, setAllowProtectedOptIn] = useState<boolean>(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [progress, setProgress] = useState<ScanProgressBatch | null>(null);
  const [error, setError] = useState<AppError | null>(null);
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

  useEffect(() => {
    const unsubscribeProgress = window.electronAPI.onScanProgressBatch((batch) => {
      setProgress(batch);
      setAggregateSizes((prev) => applyDeltas(prev, batch.deltas));

      const patch = batch.patches[0];
      if (patch) {
        setPatchStats((prev) => ({
          added: prev.added + patch.nodesAdded.length,
          updated: prev.updated + patch.nodesUpdated.length,
          pruned: prev.pruned + patch.nodesPruned.length,
        }));
      }
    });

    const unsubscribeError = window.electronAPI.onScanError((err) => {
      setError(err);
    });

    return () => {
      unsubscribeProgress();
      unsubscribeError();
    };
  }, []);

  const bubbleItems = useMemo(() => {
    return Object.entries(aggregateSizes)
      .filter((entry) => entry[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);
  }, [aggregateSizes]);

  const loadSystemInfo = async () => {
    const result = await window.electronAPI.getSystemInfo();
    if (result.ok) {
      setSystemInfo(result.data);
      setError(null);
      return;
    }

    setError(result.error);
  };

  const startScan = async () => {
    const result = await window.electronAPI.scanStart({
      rootPath,
      optInProtected: allowProtectedOptIn,
    });

    if (result.ok) {
      setScanId(result.data.scanId);
      setAggregateSizes({});
      setPatchStats({ added: 0, updated: 0, pruned: 0 });
      setError(null);
      return;
    }

    setError(result.error);
  };

  const cancelScan = async () => {
    if (!scanId) {
      return;
    }

    const result = await window.electronAPI.scanCancel(scanId);
    if (result.ok) {
      setScanId("");
      return;
    }

    setError(result.error);
  };

  return (
    <main className="app-shell">
      <h1>Disk Visualizer Bootstrap</h1>

      <section className="panel">
        <h2>System Info</h2>
        <button onClick={loadSystemInfo}>Load System Info</button>
        {systemInfo ? (
          <p>
            {systemInfo.platform} / {systemInfo.arch} / {systemInfo.release}
          </p>
        ) : (
          <p>Not loaded</p>
        )}
      </section>

      <section className="panel">
        <h2>Scan Control</h2>
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
          <button onClick={startScan}>Start</button>
          <button onClick={cancelScan} disabled={!scanId}>
            Cancel
          </button>
        </div>
        <p>scanId: {scanId || "-"}</p>
      </section>

      <section className="panel">
        <h2>Progress Batch</h2>
        {progress ? (
          <pre>{JSON.stringify(progress.progress, null, 2)}</pre>
        ) : (
          <p>No progress yet</p>
        )}
      </section>

      <section className="panel">
        <h2>Compressor Patch Stats</h2>
        <p>added: {patchStats.added}</p>
        <p>updated: {patchStats.updated}</p>
        <p>pruned: {patchStats.pruned}</p>
      </section>

      <section className="panel">
        <h2>Bubble Preview (Top 24)</h2>
        {bubbleItems.length === 0 ? (
          <p>No aggregated nodes yet</p>
        ) : (
          <div className="bubble-grid">
            {bubbleItems.map(([nodePath, size], index) => (
              <div
                key={`${nodePath}-${index}`}
                className="bubble"
                style={bubbleStyle(size, bubbleItems[0][1])}
                title={`${nodePath}\n${formatBytes(size)}`}
              >
                <span>{labelFromPath(nodePath)}</span>
                <small>{formatBytes(size)}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <section className="panel error">
          <h2>Error</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}

function applyDeltas(
  previous: Record<string, number>,
  deltas: AggDelta[],
): Record<string, number> {
  if (deltas.length === 0) {
    return previous;
  }

  const next: Record<string, number> = { ...previous };
  for (const delta of deltas) {
    const prevSize = next[delta.nodePath] ?? 0;
    next[delta.nodePath] = Math.max(prevSize + delta.sizeDelta, 0);
  }

  return next;
}

function bubbleStyle(value: number, maxValue: number): CSSProperties {
  const ratio = maxValue > 0 ? value / maxValue : 0;
  const diameter = Math.round(48 + Math.sqrt(ratio) * 132);

  return {
    width: `${diameter}px`,
    height: `${diameter}px`,
  };
}

function labelFromPath(input: string): string {
  const normalized = input.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
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
