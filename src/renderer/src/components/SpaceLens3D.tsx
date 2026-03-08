import React, { Suspense, lazy, useEffect, useState } from 'react';

const SpaceLensCanvas = lazy(() => import('./SpaceLensCanvas'));

export function SpaceLens3D({ isScanning }: { isScanning?: boolean }) {
    const [shouldRenderCanvas, setShouldRenderCanvas] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let idleCallbackId: number | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const browserWindow = globalThis as typeof window & {
            requestIdleCallback?: (
                callback: IdleRequestCallback,
                options?: IdleRequestOptions,
            ) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        if (typeof browserWindow.requestIdleCallback === "function") {
            idleCallbackId = browserWindow.requestIdleCallback(() => {
                if (!cancelled) {
                    setShouldRenderCanvas(true);
                }
            }, { timeout: 250 });
        } else {
            timeoutId = globalThis.setTimeout(() => {
                if (!cancelled) {
                    setShouldRenderCanvas(true);
                }
            }, 120);
        }

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                globalThis.clearTimeout(timeoutId);
            }

            if (
                idleCallbackId !== null &&
                typeof browserWindow.cancelIdleCallback === "function"
            ) {
                browserWindow.cancelIdleCallback(idleCallbackId);
            }
        };
    }, []);

    if (!shouldRenderCanvas) {
        return (
            <div className="w-full h-full rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(125,211,252,0.18),transparent_45%),radial-gradient(circle_at_70%_70%,rgba(34,197,94,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]" />
        );
    }

    return (
        <Suspense fallback={<div className="w-full h-full rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_30%_30%,rgba(125,211,252,0.18),transparent_45%),radial-gradient(circle_at_70%_70%,rgba(34,197,94,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]" />}>
            <SpaceLensCanvas isScanning={isScanning} />
        </Suspense>
    );
}
