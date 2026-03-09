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
            const ease = isScanning ? 0.12 : 0.1;
            currentRef.current.x += (targetRef.current.x - currentRef.current.x) * ease;
            currentRef.current.y += (targetRef.current.y - currentRef.current.y) * ease;

            const time = window.performance.now() * 0.001;
            const pointerX = currentRef.current.x;
            const pointerY = currentRef.current.y;
            const pointerRotateX = pointerY * -7.5;
            const pointerRotateY = pointerX * 9.2;
            const loopPhase = time * (isScanning ? 0.72 : 0.26);
            const loopLookX = isScanning ? Math.sin(loopPhase) * 3.2 : Math.sin(loopPhase) * 0.7;
            const loopLookY = isScanning ? Math.cos(loopPhase) * 6.8 : Math.cos(loopPhase * 0.84) * 0.85;
            const pointerInfluence = isScanning ? 0.22 : 1;
            const effectiveX = pointerX * (isScanning ? 0.42 : 0.8);
            const effectiveY = pointerY * (isScanning ? 0.38 : 0.72);
            const lookRotateX = `${loopLookX + pointerRotateX * pointerInfluence}deg`;
            const lookRotateY = `${loopLookY + pointerRotateY * pointerInfluence}deg`;
            const parallaxX = `${effectiveX * 11}px`;
            const parallaxY = `${effectiveY * 10}px`;
            const orbitRotateY = isScanning ? `${Math.cos(loopPhase) * 2.4}deg` : `${Math.sin(loopPhase * 0.92) * 2.2}deg`;
            const orbitRotateX = isScanning ? `${-5.8 + Math.sin(loopPhase * 0.84) * 1.05}deg` : `${-4.6 + Math.sin(loopPhase) * 0.8}deg`;
            const orbitRotateZ = '0deg';
            const orbitLift = isScanning
                ? `${-2.1 + Math.sin(loopPhase * 1.12) * -3.1}px`
                : `${-1.6 + Math.sin(loopPhase * 0.76) * -1.8}px`;
            const iconFloat = isScanning
                ? `${Math.cos(loopPhase * 1.04) * -1.5}px`
                : `${Math.sin(loopPhase * 0.88) * -1.1}px`;

            orbit.style.setProperty('--orbit-rotate-x', orbitRotateX);
            orbit.style.setProperty('--orbit-rotate-y', orbitRotateY);
            orbit.style.setProperty('--orbit-rotate-z', orbitRotateZ);
            orbit.style.setProperty('--orbit-lift', orbitLift);
            icon.style.setProperty('--icon-float', iconFloat);
            icon.style.setProperty('--look-rotate-x', lookRotateX);
            icon.style.setProperty('--look-rotate-y', lookRotateY);
            icon.style.setProperty('--parallax-x', parallaxX);
            icon.style.setProperty('--parallax-y', parallaxY);
            icon.style.setProperty('--icon-scale', isScanning ? '1.018' : '1');

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
