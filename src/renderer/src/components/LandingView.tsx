import React from 'react';
import { themeTokens } from '../theme/tokens';
import { DriveSelector } from './DriveSelector';

interface LandingViewProps {
    apiReady: boolean;
    rootPath: string;
    setRootPath: (path: string) => void;
    oneClickScan: () => void;
    error?: { message: string } | null;
}

export function LandingView({ apiReady, rootPath, setRootPath, oneClickScan, error }: LandingViewProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10 px-6 max-w-2xl mx-auto">
            {/* Central 3D Icon Mockup (Glassmorphic Lens) */}
            <div className="relative mb-8" style={{ filter: themeTokens.effects.iconDropShadow }}>
                <div
                    className="w-48 h-48 rounded-[40px] flex items-center justify-center relative backdrop-blur-md border border-white/10"
                    style={{
                        background: 'linear-gradient(135deg, rgba(94, 23, 235, 0.4) 0%, rgba(58, 9, 153, 0.8) 100%)',
                        boxShadow: 'inset 0 0 20px rgba(255,255,255,0.2), 0 20px 40px rgba(0,0,0,0.5)'
                    }}
                >
                    {/* Inner Ring (Lens) */}
                    <div
                        className="w-20 h-20 rounded-full border-[12px] border-white/90 shadow-inner"
                        style={{ boxShadow: '0 10px 20px rgba(0,0,0,0.3), inset 0 5px 10px rgba(0,0,0,0.5)' }}
                    />
                    {/* Lens Handle Flare */}
                    <div className="absolute bottom-10 right-10 w-6 h-6 bg-white/80 rounded-full shadow-lg blur-[2px]" />
                </div>
            </div>

            <h1 className="text-4xl font-semibold tracking-tight mb-4 text-center z-10">Space Lens</h1>
            <p
                className="text-center text-lg leading-relaxed max-w-[80%] mb-10 z-10"
                style={{ color: themeTokens.colors.textSecondary }}
            >
                디스크 공간을 가장 많이 차지하는 항목을 시각적으로 확인하고, 손쉽게 저장 공간을 정리할 수 있습니다.
            </p>

            <DriveSelector rootPath={rootPath} setRootPath={setRootPath} />

            <div className="relative group mt-4 z-10">
                <div
                    className="absolute -inset-1 rounded-full opacity-70 group-hover:opacity-100 transition duration-500 blur-md"
                    style={{ background: themeTokens.colors.primaryLight }}
                />
                <button
                    onClick={oneClickScan}
                    disabled={!apiReady}
                    className="relative flex items-center justify-center w-28 h-28 rounded-full border-2 text-xl font-bold tracking-wider transition-transform duration-300 transform group-hover:scale-105"
                    style={{
                        borderColor: themeTokens.colors.primaryLight,
                        background: 'rgba(94, 23, 235, 0.4)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: themeTokens.effects.scanGlow
                    }}
                >
                    스캔
                </button>
            </div>

            {error ? (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-500/90 backdrop-blur text-white px-5 py-3 rounded-xl text-sm max-w-md text-center shadow-2xl border border-red-400">
                    <strong className="block mb-1 text-base">Error Occurred</strong>
                    {error.message || "An unknown error occurred"}
                </div>
            ) : null}
        </div>
    );
}
