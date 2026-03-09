import React, { useEffect, useRef } from 'react';
import type { WindowState } from '../../../types/contracts';

const DEFAULT_ORBIT_STYLE = {
    '--orbit-rotate-x': '0deg',
    '--orbit-rotate-y': '0deg',
    '--orbit-rotate-z': '0deg',
    '--orbit-lift': '0px',
} as React.CSSProperties;

const DEFAULT_ICON_STYLE = {
    '--icon-scale': '1',
    '--icon-float': '0px',
    '--parallax-x': '0px',
    '--parallax-y': '0px',
    '--look-rotate-x': '0deg',
    '--look-rotate-y': '0deg',
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
    const orbitRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLDivElement>(null);
    const targetRef = useRef({ x: 0, y: 0 });
    const currentRef = useRef({ x: 0, y: 0 });

    const isInteractive = windowState
        ? windowState.isVisible && windowState.isFocused && !windowState.isMinimized
        : true;

    useEffect(() => {
        const orbit = orbitRef.current;
        const icon = iconRef.current;
        if (!icon || !orbit) {
            return;
        }

        let frameId = 0;

        const tick = () => {
            const ease = isScanning ? 0.18 : 0.14;
            currentRef.current.x += (targetRef.current.x - currentRef.current.x) * ease;
            currentRef.current.y += (targetRef.current.y - currentRef.current.y) * ease;

            const time = window.performance.now() * 0.001;
            const pointerX = currentRef.current.x;
            const pointerY = currentRef.current.y;
            const scanLoopX = isScanning ? Math.sin(time * 0.88) * 0.32 : 0;
            const scanLoopY = isScanning ? Math.cos(time * 0.88) * 0.26 : 0;
            const blendAmount = isScanning ? 0.3 : 1;
            const effectiveX = pointerX * blendAmount + scanLoopX * (1 - blendAmount);
            const effectiveY = pointerY * blendAmount + scanLoopY * (1 - blendAmount);
            const lookRotateX = `${effectiveY * 10.5}deg`;
            const lookRotateY = `${effectiveX * 12.5}deg`;
            const parallaxX = `${effectiveX * 16}px`;
            const parallaxY = `${effectiveY * 14}px`;
            const orbitRotateY = isScanning ? `${(time * 40) % 360}deg` : `${pointerX * 2.8}deg`;
            const orbitRotateX = isScanning ? `${-8 + Math.sin(time * 0.88) * 4.2}deg` : `${pointerY * 2.4}deg`;
            const orbitRotateZ = isScanning ? `${Math.sin(time * 0.44) * 0.55}deg` : `${pointerX * 0.32}deg`;
            const orbitLift = isScanning
                ? `${-1.5 + Math.sin(time * 1.76) * -3.8}px`
                : `${Math.sin(time * 0.9) * -1.6}px`;
            const iconFloat = isScanning
                ? `${Math.cos(time * 1.82) * -2.2}px`
                : `${Math.sin(time * 0.95) * -1.8}px`;

            orbit.style.setProperty('--orbit-rotate-x', orbitRotateX);
            orbit.style.setProperty('--orbit-rotate-y', orbitRotateY);
            orbit.style.setProperty('--orbit-rotate-z', orbitRotateZ);
            orbit.style.setProperty('--orbit-lift', orbitLift);
            icon.style.setProperty('--icon-float', iconFloat);
            icon.style.setProperty('--look-rotate-x', lookRotateX);
            icon.style.setProperty('--look-rotate-y', lookRotateY);
            icon.style.setProperty('--parallax-x', parallaxX);
            icon.style.setProperty('--parallax-y', parallaxY);
            icon.style.setProperty('--icon-scale', isScanning ? '1.028' : '1');

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
            const rangeX = rect.width * 0.58;
            const rangeY = rect.height * 0.58;
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
            <div
                ref={orbitRef}
                className={`space-lens-orbit ${isScanning ? 'space-lens-orbit--scanning' : ''}`}
                style={DEFAULT_ORBIT_STYLE}
            >
                <div
                    ref={iconRef}
                    className={`space-lens-icon ${isScanning ? 'space-lens-icon--scanning' : ''}`}
                    style={DEFAULT_ICON_STYLE}
                >
                    <div className="space-lens-icon__shadow" />
                    <div className="space-lens-icon__back-glow" />
                    <div className="space-lens-icon__depth-shell" />
                    <div className="space-lens-icon__body">
                        <div className="space-lens-icon__rim" />
                        <div className="space-lens-icon__core" />
                        <div className="space-lens-icon__ambient" />
                        <div className="space-lens-icon__glass-haze" />
                        <div className="space-lens-icon__side-bloom" />
                        <div className="space-lens-icon__curved-reflection" />
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
