import React from 'react';
import { themeTokens } from '../theme/tokens';

interface LayoutProps {
    children: React.ReactNode;
    apiReady: boolean;
    onMinimize: () => void;
    onMaximize: () => void;
    onClose: () => void;
}

export function Layout({ children, apiReady, onMinimize, onMaximize, onClose }: LayoutProps) {
    return (
        <div
            className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
            style={{
                background: `linear-gradient(180deg, ${themeTokens.colors.bgGradientStart} 0%, ${themeTokens.colors.bgGradientEnd} 100%)`,
                color: themeTokens.colors.textPrimary,
                fontFamily: themeTokens.typography.fontFamily
            }}
        >
            {/* Decorative background glows */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[100px] opacity-30 pointer-events-none"
                style={{ background: `radial-gradient(circle, ${themeTokens.colors.primaryLight} 0%, transparent 70%)` }}
            />

            {/* Top Window Actions */}
            <div className="absolute top-4 right-4 flex gap-3 z-50 opacity-40 hover:opacity-100 transition-opacity">
                <button onClick={onMinimize} disabled={!apiReady} className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400" aria-label="Minimize" />
                <button onClick={onMaximize} disabled={!apiReady} className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400" aria-label="Maximize" />
                <button onClick={onClose} disabled={!apiReady} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400" aria-label="Close" />
            </div>

            {children}
        </div>
    );
}
