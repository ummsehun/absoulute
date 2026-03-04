import React from 'react';
import { themeTokens } from '../theme/tokens';

interface LayoutProps {
    children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div
            className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden bg-black"
            style={{
                background: `linear-gradient(180deg, ${themeTokens.colors.bgGradientStart} 0%, ${themeTokens.colors.bgGradientEnd} 100%)`,
                color: themeTokens.colors.textPrimary,
                fontFamily: themeTokens.typography.fontFamily,
                WebkitAppRegion: 'drag'
            } as React.CSSProperties}
        >
            {/* Decorative liquid glows */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 pointer-events-none liquid-shape"
                style={{ background: `radial-gradient(circle, ${themeTokens.colors.primaryLight} 0%, transparent 70%)` }}
            />
            <div
                className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full blur-[100px] opacity-20 pointer-events-none liquid-shape"
                style={{ background: `radial-gradient(circle, #0ea5e9 0%, transparent 70%)`, animationDelay: '2s' }}
            />

            {children}
        </div>
    );
}
