import React, { useEffect, useRef } from 'react';
import type { WindowState } from '../../../types/contracts';

const DEFAULT_ICON_STYLE = {
    '--icon-scale': '1',
    '--parallax-x': '0px',
    '--parallax-y': '0px',
    '--rotate-x': '0deg',
    '--rotate-y': '0deg',
} as React.CSSProperties;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function SpaceLens3D({
    isScanning,
    windowState,
}: {
    isScanning?: boolean;
    windowState?: WindowState | null;
}) {
    const stageRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLDivElement>(null);
    const targetRef = useRef({ x: 0, y: 0 });
    const currentRef = useRef({ x: 0, y: 0 });

    const isInteractive = windowState
        ? windowState.isVisible && windowState.isFocused && !windowState.isMinimized
        : true;

    useEffect(() => {
        const icon = iconRef.current;
        if (!icon) {
            return;
        }

        let frameId = 0;

        const tick = () => {
            currentRef.current.x += (targetRef.current.x - currentRef.current.x) * 0.16;
            currentRef.current.y += (targetRef.current.y - currentRef.current.y) * 0.16;

            const rotationX = `${currentRef.current.y * 6.5}deg`;
            const rotationY = `${currentRef.current.x * -8.5}deg`;
            const parallaxX = `${currentRef.current.x * 16}px`;
            const parallaxY = `${currentRef.current.y * 14}px`;

            icon.style.setProperty('--rotate-x', rotationX);
            icon.style.setProperty('--rotate-y', rotationY);
            icon.style.setProperty('--parallax-x', parallaxX);
            icon.style.setProperty('--parallax-y', parallaxY);
            icon.style.setProperty('--icon-scale', isScanning ? '1.02' : '1');

            frameId = window.requestAnimationFrame(tick);
        };

        frameId = window.requestAnimationFrame(tick);

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [isScanning]);

    useEffect(() => {
        if (isInteractive) {
            return;
        }

        targetRef.current = { x: 0, y: 0 };
    }, [isInteractive]);

    useEffect(() => {
        const updatePointer = (event: PointerEvent) => {
            if (!isInteractive) {
                return;
            }

            const stage = stageRef.current;
            if (!stage) {
                return;
            }

            const rect = stage.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const rangeX = rect.width * 0.72;
            const rangeY = rect.height * 0.72;
            const nextX = (event.clientX - centerX) / rangeX;
            const nextY = (event.clientY - centerY) / rangeY;

            targetRef.current = {
                x: clamp(nextX, -1, 1),
                y: clamp(nextY, -1, 1),
            };
        };

        const resetPointer = () => {
            targetRef.current = { x: 0, y: 0 };
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') {
                resetPointer();
            }
        };

        window.addEventListener('pointermove', updatePointer, { passive: true });
        window.addEventListener('blur', resetPointer);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('pointermove', updatePointer);
            window.removeEventListener('blur', resetPointer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isInteractive]);

    return (
        <div ref={stageRef} className="space-lens-stage" aria-hidden="true">
            <div className={`space-lens-orbit ${isScanning ? 'space-lens-orbit--scanning' : ''}`}>
                <div
                    ref={iconRef}
                    className={`space-lens-icon ${isScanning ? 'space-lens-icon--scanning' : ''}`}
                    style={DEFAULT_ICON_STYLE}
                >
                    <div className="space-lens-icon__shadow" />
                    <div className="space-lens-icon__body">
                        <div className="space-lens-icon__rim" />
                        <div className="space-lens-icon__core" />
                        <div className="space-lens-icon__ambient" />
                        <div className="space-lens-icon__glass-haze" />
                        <div className="space-lens-icon__side-bloom" />
                        <div className="space-lens-icon__top-gloss" />
                        <div className="space-lens-icon__vertical-gloss" />
                        <div className="space-lens-icon__specular-dot" />
                        <div className="space-lens-icon__bottom-rim" />
                        <div className="space-lens-icon__ring-glow" />
                        <div className="space-lens-icon__ring">
                            <div className="space-lens-icon__ring-inner" />
                        </div>
                        <div className="space-lens-icon__pill-glow" />
                        <div className="space-lens-icon__pill" />
                    </div>
                </div>
            </div>
        </div>
    );
}
