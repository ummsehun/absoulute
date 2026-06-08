import { startTransition, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type {
    AggDelta,
    AppError,
    FullDiskAccessStatus,
    HelperClientStatus,
    ScanCoverageUpdate,
    ScanDiagnostics,
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
import {
    buildDefaultScanRequest,
} from "./scanRequestFactory";

const PREFLIGHT_SCAN_ID = "preflight";
const RESPONSIVE_POLICY_SKIPS = true;
const DEFAULT_SCAN_ROOT = "/Users";

export function useScanLogic() {
    const electronAPI = getElectronAPI();
    const [rootPath, setRootPath] = useState<string>(DEFAULT_SCAN_ROOT);
    const [scanId, setScanId] = useState<string>("");
    const [allowProtectedOptIn, setAllowProtectedOptIn] = useState<boolean>(false);
    const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
    const [windowState, setWindowState] = useState<WindowState | null>(null);
    const [progress, setProgress] = useState<ScanProgressBatch | null>(null);
    const [error, setError] = useState<AppError | null>(null);
    const [coverageUpdate, setCoverageUpdate] = useState<ScanCoverageUpdate | null>(null);
    const [diagnostics, setDiagnostics] = useState<ScanDiagnostics | null>(null);
    const [perfSample, setPerfSample] = useState<ScanPerfSample | null>(null);
    const [elevationRequired, setElevationRequired] = useState<ScanElevationRequired | null>(null);
    const [scanTerminal, setScanTerminal] = useState<ScanTerminalEvent | null>(null);
    const [fullDiskAccessStatus, setFullDiskAccessStatus] =
        useState<FullDiskAccessStatus | null>(null);
    const [helperStatus, setHelperStatus] = useState<HelperClientStatus | null>(null);
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
    const scanIdRef = useRef<string>("");
    const startRequestInFlightRef = useRef(false);

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
        startTransition(() => {
            setAggregateSizes({ ...aggregateRef.current });
        });
        lastVisualCommitRef.current = Date.now();
    });

    useEffect(() => {
        scanBasePathRef.current = scanBasePath;
        activeRootPathRef.current = activeRootPath;
        rootPathRef.current = rootPath;
        scanIdRef.current = scanId;
    }, [scanBasePath, activeRootPath, rootPath, scanId]);

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

            const fullDiskAccessResult = await electronAPI.checkFullDiskAccess();
            if (fullDiskAccessResult.ok) {
                setFullDiskAccessStatus(fullDiskAccessResult.data);
            }

            const helperStatusResult = await electronAPI.getHelperStatus();
            if (helperStatusResult.ok) {
                setHelperStatus(helperStatusResult.data);
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

        const unsubscribeDiagnostics = electronAPI.onScanDiagnostics((event) => {
            setDiagnostics(event);
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
            unsubscribeDiagnostics();
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

    const startScanForPath = async (nextRootPath: string) => {
        if (!electronAPI) return;
        if (startRequestInFlightRef.current || scanIdRef.current) {
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

        const scanRequest = buildDefaultScanRequest({
            rootPath: normalizedRoot,
            optInProtected: allowProtectedOptIn,
            responsivePolicySkips: RESPONSIVE_POLICY_SKIPS,
        });

        startRequestInFlightRef.current = true;
        const result = await electronAPI.scanStart(scanRequest).finally(() => {
            startRequestInFlightRef.current = false;
        });

        if (result.ok) {
            aggregateRef.current = {};
            pendingDeltasRef.current = [];
            lastVisualCommitRef.current = Date.now();
            setScanId(result.data.scanId);
            setScanStartedAt(result.data.startedAt);
            setRootPath(normalizedRoot);
            setScanBasePath(normalizedRoot);
            setActiveRootPath(normalizedRoot);
            setProgress(null);
            setAggregateSizes({});
            setPatchStats({ added: 0, updated: 0, pruned: 0 });
            setWarningSummary({ permission: 0, io: 0, lastPath: null });
            setCoverageUpdate(null);
            setDiagnostics(null);
            setScanTerminal(null);
            setPerfSample(null);
            setElevationRequired(null);
            setError(null);
        } else {
            if (result.error.code === "E_OPTIN_REQUIRED" || result.error.code === "E_PERMISSION") {
                setElevationRequired({
                    scanId: PREFLIGHT_SCAN_ID,
                    targetPath: normalizedRoot,
                    reason: "선택한 경로는 Full Disk Access 또는 파일 접근 권한이 필요합니다. 설정에서 접근 권한을 허용해 주세요.",
                    policy: "manual",
                });
                setError(null);
                return;
            }
            setError(result.error);
        }
    };

    const oneClickScan = async () => await startScanForPath(rootPath);
    const scanTopRoot = async () => await startScanForPath(getTopRootPath(rootPath));

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
            setError(null);
            return;
        }

        setElevationRequired((current) => ({
            scanId: current?.scanId ?? PREFLIGHT_SCAN_ID,
            targetPath: normalized,
            reason: "시스템 설정에서 앱의 Full Disk Access를 허용한 뒤 SCAN을 다시 실행해 주세요.",
            policy: "manual",
        }));
        setError(null);
    };

    const checkFullDiskAccess = async () => {
        if (!electronAPI) return;
        const result = await electronAPI.checkFullDiskAccess();
        if (result.ok) {
            setFullDiskAccessStatus(result.data);
            if (result.data.granted) {
                setAllowProtectedOptIn(true);
                setElevationRequired(null);
            }
            setError(null);
            return;
        }
        setError(result.error);
    };

    const requestFullDiskAccess = async () => {
        if (!electronAPI) return;
        const result = await electronAPI.requestFullDiskAccess();
        if (result.ok) {
            setFullDiskAccessStatus(result.data);
            if (result.data.granted) {
                setAllowProtectedOptIn(true);
                setElevationRequired(null);
            }
            setError(null);
            return;
        }
        setError(result.error);
    };

    const checkHelperStatus = useCallback(async (
        options: { clearErrorOnSuccess?: boolean } = {},
    ) => {
        if (!electronAPI) return;
        const clearErrorOnSuccess = options.clearErrorOnSuccess ?? true;
        const result = await electronAPI.getHelperStatus();
        if (result.ok) {
            setHelperStatus(result.data);
            if (clearErrorOnSuccess) {
                setError(null);
            }
            return;
        }
        setError(result.error);
    }, [electronAPI]);

    const registerHelper = useCallback(async () => {
        if (!electronAPI) return;
        const result = await electronAPI.registerHelper();
        if (result.ok) {
            setHelperStatus(result.data);
            setError(null);
            return;
        }
        setError(result.error);
        void checkHelperStatus({ clearErrorOnSuccess: false });
    }, [checkHelperStatus, electronAPI]);

    const visualizationRoot = useMemo(
        () => activeRootPath || scanBasePath || normalizeFsPath(rootPath),
        [activeRootPath, scanBasePath, rootPath],
    );

    const breadcrumbPaths = useMemo(() => {
        return buildBreadcrumbPaths(scanBasePath || normalizeFsPath(rootPath), visualizationRoot);
    }, [rootPath, scanBasePath, visualizationRoot]);

    const focusedTopItems = useMemo(() => {
        return getTopItemsForPath(aggregateSizes, visualizationRoot, 32);
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
        diagnostics,
        perfSample,
        elevationRequired,
        fullDiskAccessStatus,
        helperStatus,
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
        oneClickScan,
        scanTopRoot,
        cancelScan,
        pauseScan,
        resumeScan,
        resolveElevation,
        checkFullDiskAccess,
        requestFullDiskAccess,
        checkHelperStatus,
        registerHelper,
        minimizeWindow,
        toggleMaximizeWindow,
        closeWindow,
    };
}

function getElectronAPI(): ElectronAPI | null {
    return (window as Window & { electronAPI?: ElectronAPI }).electronAPI ?? null;
}
