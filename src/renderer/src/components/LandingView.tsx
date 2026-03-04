import React from 'react';
import { themeTokens } from '../theme/tokens';
import { DriveSelector } from './DriveSelector';
import { SpaceLens3D } from './SpaceLens3D';

interface LandingViewProps {
    apiReady: boolean;
    rootPath: string;
    setRootPath: (path: string) => void;
    oneClickScan: () => void;
    error?: { message: string } | null;
}

export function LandingView({ apiReady, rootPath, setRootPath, oneClickScan, error }: LandingViewProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10 px-6 max-w-2xl mx-auto" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <div
                className="w-full flex-1 flex flex-col items-center justify-center"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                {/* Real 3D Canvas Container */}
                <div className="relative w-80 h-80 mb-8 flex items-center justify-center group">
                    {/* Animated Liquid Background Blobs behind 3D Canvas */}
                    <div
                        className="absolute inset-0 bg-gradient-to-tr from-purple-600 to-indigo-500 opacity-50 liquid-shape blur-2xl transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110"
                    />
                    <div
                        className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-blue-600 opacity-40 liquid-spin blur-xl mix-blend-screen transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-125 group-hover:rotate-12"
                        style={{ animationDuration: '10s' }}
                    />

                    <div className="relative w-72 h-72 z-10">
                        <React.Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/50 text-sm">Loading 3D Engine...</div>}>
                            <SpaceLens3D />
                        </React.Suspense>
                    </div>
                </div>

                <h1 className="text-5xl font-bold tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-br from-white via-blue-100 to-white/60 z-10">Space Lens</h1>
                <p
                    className="text-center text-lg leading-relaxed max-w-[85%] mb-12 z-10 font-light"
                    style={{ color: themeTokens.colors.textSecondary }}
                >
                    디스크 공간을 가장 많이 차지하는 항목을 시각적으로 확인하고, 손쉽게 저장 공간을 정리할 수 있습니다.
                </p>

                {/* Glassmorphic Drive Selector Container */}
                <div className="relative mb-12 w-full max-w-sm">
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

                {error ? (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-500/90 backdrop-blur text-white px-5 py-3 rounded-2xl text-sm max-w-md text-center shadow-[0_10px_40px_rgba(239,68,68,0.5)] border border-red-400 animate-in slide-in-from-bottom">
                        <strong className="block mb-1 text-base">Error Occurred</strong>
                        {error.message || "An unknown error occurred"}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
