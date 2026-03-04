import { useEffect, useState } from "react";
import type { AppError, ScanProgressBatch, SystemInfo } from "../../types/contracts";

function App() {
  const [rootPath, setRootPath] = useState<string>(".");
  const [scanId, setScanId] = useState<string>("");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [progress, setProgress] = useState<ScanProgressBatch | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    const unsubscribeProgress = window.electronAPI.onScanProgressBatch((batch) => {
      setProgress(batch);
    });

    const unsubscribeError = window.electronAPI.onScanError((err) => {
      setError(err);
    });

    return () => {
      unsubscribeProgress();
      unsubscribeError();
    };
  }, []);

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
      optInProtected: false,
    });

    if (result.ok) {
      setScanId(result.data.scanId);
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

      {error && (
        <section className="panel error">
          <h2>Error</h2>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}

export default App;
