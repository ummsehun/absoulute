import { useEffect, useMemo, useRef, useState } from "react";
import type {
    AggDelta,
    AppError,
    ScanCoverageUpdate,
    ScanElevationRequired,
    ScanPerfSample,
    ScanProgressBatch,
    SystemInfo,
    WindowState,
} from "../../../types/contracts";
import type { ElectronAPI } from "../../../types/electron-api";
import {
    VISUAL_COMMIT_INTERVAL_MS,
    VISUAL_DELTA_BURST,
    applyDeltasInPlace,
    getErrorTargetPath,
    getTopItemsForPath,
    getTopRootPath,
    pruneAggregateStateInPlace,
    normalizeFsPath,
    buildBreadcrumbPaths,
} from "../utils/helpers";

export function useScanLogic() {
    const electronAPI = getElectronAPI();
    const [rootPath, setRootPath] = useState<string>(".");
    const [scanId, setScanId] = useState<string>("");
    const [allowProtectedOptIn, setAllowProtectedOptIn] = useState<boolean>(false);
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [windowState, setWindowState] = useState<WindowState | null>(null);
    const [progress, setProgress] = useState<ScanProgressBatch | null>(null);
    const [error, setError] = useState<AppError | null>(null);
    const [coverageUpdate, setCoverageUpdate] = useState<ScanCoverageUpdate | null>(null);
    const [perfSample, setPerfSample] = useState<ScanPerfSample | null>(null);
    const [elevationRequired, setElevationRequired] = useState<ScanElevationRequired | null>(null);
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
    const [scanBasePath, setScanBasePath] = useState<string>("");
    const [activeRootPath, setActiveRootPath] = useState<string>("");
    const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);

    const apiReady = Boolean(electronAPI);
    const aggregateRef = useRef<Record<string, number>>({});
    const pendingDeltasRef = useRef<AggDelta[]>([]);
    const lastVisualCommitRef = useRef<number>(0);
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
            setTimeout(() => {
                setError({
                    code: "E_IO",
                    message: "preload bridge is unavailable",
                    recoverable: false,
                });
            }, 0);
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
            const aggBatchItems =
                batch.aggBatches?.flatMap((aggBatch) => aggBatch.items) ?? [];
            if (batch.deltas.length > 0) {
                pendingDeltasRef.current.push(...batch.deltas);
            } else if (aggBatchItems.length > 0) {
                pendingDeltasRef.current.push(...aggBatchItems);
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
            if (err.code === "E_NATIVE_FAILURE") {
                setError(err);
                return;
            }

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

        const unsubscribeCoverage = electronAPI.onScanCoverageUpdate((event) => {
            setCoverageUpdate(event);
        });

        const unsubscribePerfSample = electronAPI.onScanPerfSample((event) => {
            setPerfSample(event);
        });

        const unsubscribeElevationRequired = electronAPI.onScanElevationRequired((event) => {
            setElevationRequired(event);
        });

        return () => {
            unsubscribeWindowState();
            unsubscribeProgress();
            unsubscribeError();
            unsubscribeCoverage();
            unsubscribePerfSample();
            unsubscribeElevationRequired();
        };
    }, [electronAPI]);

    const loadSystemInfo = async () => {
        if (!electronAPI) return;
        const result = await electronAPI.getSystemInfo();
        if (result.ok) {
            setSystemInfo(result.data);
            setError(null);
        } else {
            setError(result.error);
        }
    };

    const startScanForPath = async (nextRootPath: string) => {
        if (!electronAPI) return;

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
            performanceProfile: "accuracy-first",
            scanMode: "native_rust",
            accuracyMode: "full",
            elevationPolicy: "manual",
            emitPolicy: {
                aggBatchMaxItems: 512,
                aggBatchMaxMs: 120,
                progressIntervalMs: 120,
            },
            concurrencyPolicy: {
                min: 16,
                max: 64,
                adaptive: true,
            },
            allowNodeFallback: false,
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
            setCoverageUpdate(null);
            setPerfSample(null);
            setElevationRequired(null);
            setError(null);
        } else {
            setError(result.error);
        }
    };

    const startScan = async () => await startScanForPath(rootPath);
    const oneClickScan = async () => await startScanForPath(rootPath);
    const scanTopRoot = async () => await startScanForPath(getTopRootPath(rootPath));

    const cancelScan = async () => {
        if (!scanId || !electronAPI) return;
        const result = await electronAPI.scanCancel(scanId);
        if (result.ok) {
            setScanId("");
            setScanStartedAt(null);
        } else {
            setError(result.error);
        }
    };

    const pauseScan = async () => {
        if (!scanId || !electronAPI) return;
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
        if (!scanId || !electronAPI) return;
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
        if (!electronAPI) return;
        const result = await electronAPI.minimizeWindow();
        if (!result.ok) setError(result.error);
    };

    const toggleMaximizeWindow = async () => {
        if (!electronAPI) return;
        const result = await electronAPI.toggleMaximizeWindow();
        if (!result.ok) setError(result.error);
    };

    const closeWindow = async () => {
        if (!electronAPI) return;
        const result = await electronAPI.closeWindow();
        if (!result.ok) setError(result.error);
    };

    const visualizationRoot = activeRootPath || scanBasePath || normalizeFsPath(rootPath);

    const breadcrumbPaths = useMemo(() => {
        return buildBreadcrumbPaths(scanBasePath || normalizeFsPath(rootPath), visualizationRoot);
    }, [rootPath, scanBasePath, visualizationRoot]);

    const focusedTopItems = useMemo(() => {
        return getTopItemsForPath(aggregateSizes, visualizationRoot, 12);
    }, [aggregateSizes, visualizationRoot]);

    return {
        // State
        rootPath, setRootPath,
        scanId,
        allowProtectedOptIn, setAllowProtectedOptIn,
        systemInfo,
        windowState,
        progress,
        error,
        warningSummary,
        coverageUpdate,
        perfSample,
        elevationRequired,
        aggregateSizes,
        patchStats,
        scanBasePath,
        activeRootPath, setActiveRootPath,
        scanStartedAt,
        apiReady,
        visualizationRoot,
        breadcrumbPaths,
        focusedTopItems,

        // Actions
        loadSystemInfo,
        startScan,
        oneClickScan,
        scanTopRoot,
        cancelScan,
        pauseScan,
        resumeScan,
        minimizeWindow,
        toggleMaximizeWindow,
        closeWindow,
    };
}

function getElectronAPI(): ElectronAPI | null {
    return (window as Window & { electronAPI?: ElectronAPI }).electronAPI ?? null;
}
