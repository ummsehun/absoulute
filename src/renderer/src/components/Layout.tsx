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
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px] h-[620px] rounded-full blur-[130px] opacity-25 pointer-events-none"
                style={{ background: `radial-gradient(circle, ${themeTokens.colors.primaryLight} 0%, transparent 70%)` }}
            />
            <div
                className="absolute bottom-[-6rem] right-[-4rem] w-[460px] h-[460px] rounded-full blur-[100px] opacity-20 pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.8) 0%, transparent 70%)' }}
            />
            <div
                className="absolute top-[-5rem] left-[-4rem] w-[360px] h-[360px] rounded-full blur-[90px] opacity-15 pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(244,114,182,0.8) 0%, transparent 70%)' }}
            />

            {children}
        </div>
    );
}
