import React from 'react';
import { themeTokens } from '../theme/tokens';
import { DriveSelector } from './DriveSelector';
import { SpaceLens3D } from './SpaceLens3D';
import type { ScanElevationRequired, ScanPerfSample, ScanProgressBatch, WindowState } from '../../../types/contracts';

interface LandingViewProps {
    apiReady: boolean;
    rootPath: string;
    setRootPath: (path: string) => void;
    oneClickScan: () => void;
    onResolveElevation?: (targetPath: string) => void | Promise<void>;
    error?: { message: string } | null;
    elevationRequired?: ScanElevationRequired | null;
    isScanning?: boolean;
    progress?: ScanProgressBatch | null;
    perfSample?: ScanPerfSample | null;
    windowState?: WindowState | null;
}

export function LandingView({
    apiReady,
    rootPath,
    setRootPath,
    oneClickScan,
    onResolveElevation,
    error,
    elevationRequired,
    isScanning,
    progress,
    perfSample,
    windowState,
}: LandingViewProps) {
    const phaseDetail = getPhaseDetail(progress);
    const inflight = perfSample?.inflightStats?.inFlight ?? perfSample?.queueDepth ?? 0;
    const deferredByBudget = perfSample?.deferredByBudget ?? 0;
    const softSkippedByPolicy = perfSample?.softSkippedByPolicy ?? 0;

    return (
        <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10 px-6 max-w-2xl mx-auto" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div
                className="w-full flex-1 flex flex-col items-center justify-center"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                {/* Real 3D Canvas Container */}
                <div className={`relative w-80 h-80 mb-8 flex items-center justify-center overflow-visible group transition-transform duration-1000 ${isScanning ? 'scale-110' : ''}`}>
                    {/* Animated Liquid Background Blobs behind 3D Canvas */}
                    <div
                        className="absolute inset-0 bg-gradient-to-tr from-purple-600 to-indigo-500 opacity-50 liquid-shape blur-2xl transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110"
                    />
                    <div
                        className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-blue-600 opacity-40 liquid-spin blur-xl mix-blend-screen transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-125 group-hover:rotate-12"
                        style={{ animationDuration: isScanning ? '4s' : '10s' }}
                    />

                    <div className="relative z-20 h-80 w-80">
                        <SpaceLens3D isScanning={isScanning} windowState={windowState} />
                    </div>
                </div>

                <h1 className="text-5xl font-bold tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-br from-white via-blue-100 to-white/60 z-10">Space Lens</h1>
                <p
                    className="text-center text-lg leading-relaxed max-w-[85%] mb-12 z-10 font-light transition-opacity duration-300"
                    style={{ color: themeTokens.colors.textSecondary, opacity: isScanning ? 0 : 1 }}
                >
                    디스크 공간을 가장 많이 차지하는 항목을 시각적으로 확인하고, 손쉽게 저장 공간을 정리할 수 있습니다.
                </p>

                <div className="h-40 relative flex items-center justify-center w-full">
                    {/* Scanning UI */}
                    <div
                        className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ${isScanning ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-4 invisible'}`}
                    >
                        <h2 className="text-2xl font-semibold text-white/90 mb-2 drop-shadow-md">
                            {phaseDetail.title}
                        </h2>
                        <p className="text-sm text-cyan-200/70 mb-1 animate-pulse">
                            {phaseDetail.subtitle}
                        </p>
                        <p className="text-xs text-cyan-100/60 mb-4 font-mono">
                            {`inflight ${inflight.toLocaleString()} | deferred ${deferredByBudget.toLocaleString()} | policy-skip ${softSkippedByPolicy.toLocaleString()}`}
                        </p>
                        <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm border border-white/5 relative">
                            {/* Indeterminate loading bar */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400 to-transparent w-full h-full opacity-50" style={{ animation: 'shimmer 1.5s infinite linear', backgroundSize: '200% 100%' }} />
                        </div>
                        <div className="mt-4 flex gap-6 text-xs text-white/50 font-mono">
                            <span>{progress?.progress.scannedCount.toLocaleString() || 0} Files</span>
                            <span>{((progress?.progress.totalBytes || 0) / 1e9).toFixed(2)} GB</span>
                        </div>
                    </div>

                    {/* Default UI */}
                    <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ${!isScanning ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-4 invisible pointer-events-none'}`}>
                        {/* Glassmorphic Drive Selector Container */}
                        <div className="relative mb-6 w-full max-w-sm">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/40 to-blue-500/40 rounded-3xl blur opacity-70"></div>
                            <div className="relative flex items-center justify-center bg-black/50 backdrop-blur-2xl rounded-3xl border border-white/20 p-2 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)] transition-transform duration-300 hover:scale-[1.02]">
                                <DriveSelector rootPath={rootPath} setRootPath={setRootPath} />
                            </div>
                        </div>

                        {/* Liquid Scan Button */}
                        <div className="relative group mt-2 z-10">
                            <div
                                className="absolute -inset-2 rounded-[40px] opacity-40 group-hover:opacity-100 transition duration-500 blur-lg liquid-shape bg-gradient-to-r from-cyan-400 via-purple-500 to-indigo-500"
                            />
                            <button
                                onClick={oneClickScan}
                                disabled={!apiReady}
                                className="relative flex items-center justify-center w-40 h-16 rounded-[28px] text-xl font-bold tracking-widest transition-all duration-300 transform group-hover:scale-105 bg-white/10 border border-white/20 backdrop-blur-xl shadow-2xl text-white overflow-hidden ring-1 ring-white/30"
                            >
                                <span className="relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">SCAN</span>
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                            </button>
                        </div>
                    </div>
                </div>

                {error ? (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-500/90 backdrop-blur text-white px-5 py-3 rounded-2xl text-sm max-w-md text-center shadow-[0_10px_40px_rgba(239,68,68,0.5)] border border-red-400 animate-in slide-in-from-bottom">
                        <strong className="block mb-1 text-base">Error Occurred</strong>
                        {error.message || "An unknown error occurred"}
                    </div>
                ) : null}

                {!error && elevationRequired ? (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-amber-500/90 backdrop-blur text-black px-5 py-3 rounded-2xl text-sm max-w-xl text-center shadow-[0_10px_40px_rgba(245,158,11,0.35)] border border-amber-300 animate-in slide-in-from-bottom">
                        <strong className="block mb-1 text-base">권한 상승 필요</strong>
                        <div className="mb-2">{elevationRequired.targetPath}</div>
                        <button
                            type="button"
                            onClick={() => {
                                void onResolveElevation?.(elevationRequired.targetPath);
                            }}
                            className="px-3 py-1 rounded-lg bg-black/70 text-amber-100 text-xs font-semibold border border-amber-200/50 hover:bg-black/80 transition-colors"
                        >
                            권한 설정 열기
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function getPhaseDetail(progress?: ScanProgressBatch | null): {
    title: string;
    subtitle: string;
} {
    const phase = progress?.progress.phase;
    if (phase === "finalizing") {
        return {
            title: "Finalizing...",
            subtitle: "Preparing the visualization",
        };
    }

    if (phase === "compressing") {
        return {
            title: "Compressing...",
            subtitle: "Reducing the tree for rendering",
        };
    }

    if (phase === "aggregating") {
        return {
            title: "Aggregating...",
            subtitle: "Merging scan batches into the final tree",
        };
    }

    if (phase === "paused") {
        return {
            title: "Paused",
            subtitle: `Dir: ${getCurrentDirectoryLabel(progress?.progress.currentPath)}`,
        };
    }

    return {
        title: "Scanning Spaces...",
        subtitle: `Dir: ${getCurrentDirectoryLabel(progress?.progress.currentPath)}`,
    };
}

function getCurrentDirectoryLabel(currentPath?: string): string {
    if (!currentPath) {
        return "Analyzing root directory";
    }

    const normalized = currentPath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized) {
        return "/";
    }

    const separatorIndex = normalized.lastIndexOf("/");
    if (separatorIndex <= 0) {
        return normalized;
    }

    return normalized.slice(0, separatorIndex) || "/";
}
