import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { resolveScanIntent } from "../../../shared/domain/scanIntent";
import type {
    AggDelta,
    AppError,
    ScanDeepPolicyPreset,
    ScanCoverageUpdate,
    ScanElevationRequired,
    ScanPerfSample,
    ScanProgressBatch,
    ScanTerminalEvent,
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
    const [scanTerminal, setScanTerminal] = useState<ScanTerminalEvent | null>(null);
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

    const commitPendingDeltas = useEffectEvent(() => {
        if (pendingDeltasRef.current.length === 0) {
            return;
        }

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
        lastVisualCommitRef.current = Date.now();
    });

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
                commitPendingDeltas();
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

        const unsubscribeTerminal = electronAPI.onScanTerminal((event) => {
            commitPendingDeltas();
            setScanTerminal(event);
            setScanId("");
            setScanStartedAt(null);
            setElevationRequired(null);
            if (event.status !== "failed") {
                setError(null);
            }
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
            unsubscribeTerminal();
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

    const startScanForPath = async (
        nextRootPath: string,
        deepPolicyPreset: ScanDeepPolicyPreset = "responsive",
    ) => {
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

        const scanIntent = resolveScanIntent({ deepPolicyPreset });

        const result = await electronAPI.scanStart({
            rootPath: normalizedRoot,
            optInProtected: allowProtectedOptIn,
            performanceProfile: scanIntent.performanceProfile,
            scanMode: "native_rust",
            accuracyMode: scanIntent.accuracyMode,
            deepPolicyPreset: scanIntent.deepPolicyPreset,
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
            setScanTerminal(null);
            setPerfSample(null);
            setElevationRequired(null);
            setError(null);
        } else {
            if (result.error.code === "E_OPTIN_REQUIRED") {
                setElevationRequired({
                    scanId: "scan-preflight",
                    targetPath: normalizedRoot,
                    reason: "선택한 경로는 명시적 권한 허용이 필요합니다. 설정에서 접근 권한을 허용해 주세요.",
                    policy: "manual",
                });
                setError(null);
                return;
            }
            setError(result.error);
        }
    };

    const startScan = async () => await startScanForPath(rootPath, "responsive");
    const oneClickScan = async () => await startScanForPath(rootPath, "responsive");
    const scanTopRoot = async () => await startScanForPath(getTopRootPath(rootPath), "responsive");
    const exactRecheck = async () =>
        await startScanForPath(scanBasePathRef.current || rootPathRef.current, "exact");

    const cancelScan = async () => {
        if (!scanId || !electronAPI) return;
        const result = await electronAPI.scanCancel(scanId);
        if (!result.ok) {
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

    const resolveElevation = async (targetPath: string) => {
        if (!electronAPI) return;
        const normalized = normalizeFsPath(targetPath);
        if (!normalized) return;

        const result = await electronAPI.requestElevation(normalized);
        if (!result.ok) {
            setError(result.error);
            return;
        }

        if (result.data.granted) {
            setAllowProtectedOptIn(true);
            setElevationRequired(null);
            return;
        }

        setError({
            code: "E_PERMISSION",
            message: "권한이 아직 허용되지 않았습니다. 시스템 설정에서 Full Disk Access를 허용해 주세요.",
            recoverable: true,
            details: { targetPath: normalized },
        });
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
        scanTerminal,
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
        exactRecheck,
        cancelScan,
        pauseScan,
        resumeScan,
        resolveElevation,
        minimizeWindow,
        toggleMaximizeWindow,
        closeWindow,
    };
}

function getElectronAPI(): ElectronAPI | null {
    return (window as Window & { electronAPI?: ElectronAPI }).electronAPI ?? null;
}
