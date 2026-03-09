import React, { useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WindowState } from '../../../types/contracts';

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function drawRoundedRectPath(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
) {
    const limitedRadius = Math.min(radius, width * 0.5, height * 0.5);
    context.beginPath();
    context.moveTo(x + limitedRadius, y);
    context.arcTo(x + width, y, x + width, y + height, limitedRadius);
    context.arcTo(x + width, y + height, x, y + height, limitedRadius);
    context.arcTo(x, y + height, x, y, limitedRadius);
    context.arcTo(x, y, x + width, y, limitedRadius);
    context.closePath();
}

function createSpaceLensFaceTexture() {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');
    if (!context) {
        const fallback = new THREE.CanvasTexture(canvas);
        fallback.colorSpace = THREE.SRGBColorSpace;
        return fallback;
    }

    const bodyX = 54;
    const bodyY = 34;
    const bodySize = 1940;
    const bodyRadius = 408;

    context.clearRect(0, 0, size, size);

    drawRoundedRectPath(context, bodyX, bodyY, bodySize, bodySize, bodyRadius);
    context.clip();

    const mainGradient = context.createLinearGradient(0, bodyY, 0, bodyY + bodySize);
    mainGradient.addColorStop(0, '#6765ff');
    mainGradient.addColorStop(0.28, '#4744fa');
    mainGradient.addColorStop(0.62, '#1e2bc1');
    mainGradient.addColorStop(1, '#050d46');
    context.fillStyle = mainGradient;
    context.fillRect(bodyX, bodyY, bodySize, bodySize);

    const pinkBloom = context.createRadialGradient(1510, 438, 24, 1510, 438, 720);
    pinkBloom.addColorStop(0, 'rgba(255, 221, 246, 0.48)');
    pinkBloom.addColorStop(0.3, 'rgba(255, 205, 240, 0.22)');
    pinkBloom.addColorStop(1, 'rgba(255, 205, 240, 0)');
    context.fillStyle = pinkBloom;
    context.fillRect(bodyX, bodyY, bodySize, bodySize);

    const blueGlow = context.createRadialGradient(928, 1128, 0, 928, 1128, 620);
    blueGlow.addColorStop(0, 'rgba(17, 89, 255, 0.3)');
    blueGlow.addColorStop(0.48, 'rgba(17, 89, 255, 0.12)');
    blueGlow.addColorStop(1, 'rgba(17, 89, 255, 0)');
    context.fillStyle = blueGlow;
    context.fillRect(bodyX, bodyY, bodySize, bodySize);

    const lowerShade = context.createLinearGradient(0, bodyY + bodySize * 0.44, 0, bodyY + bodySize);
    lowerShade.addColorStop(0, 'rgba(3, 8, 52, 0)');
    lowerShade.addColorStop(1, 'rgba(3, 8, 52, 0.72)');
    context.fillStyle = lowerShade;
    context.fillRect(bodyX, bodyY, bodySize, bodySize);

    context.save();
    context.filter = 'blur(42px)';
    context.globalAlpha = 0.42;
    context.fillStyle = 'rgba(255, 241, 251, 0.56)';
    context.beginPath();
    context.ellipse(1512, 744, 268, 614, 0.24, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.filter = 'blur(32px)';
    context.globalAlpha = 0.34;
    context.fillStyle = 'rgba(67, 112, 255, 0.8)';
    context.beginPath();
    context.ellipse(914, 1172, 402, 246, -0.58, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.lineWidth = 3;
    context.strokeStyle = 'rgba(202, 220, 255, 0.36)';
    drawRoundedRectPath(context, bodyX + 10, bodyY + 10, bodySize - 20, bodySize - 20, bodyRadius - 10);
    context.stroke();

    context.lineWidth = 2;
    context.strokeStyle = 'rgba(90, 136, 255, 0.34)';
    drawRoundedRectPath(context, bodyX + 4, bodyY + 4, bodySize - 8, bodySize - 8, bodyRadius - 4);
    context.stroke();

    context.save();
    context.filter = 'blur(8px)';
    context.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    context.lineWidth = 10;
    drawRoundedRectPath(context, bodyX + 14, bodyY + 14, bodySize - 28, bodySize - 28, bodyRadius - 16);
    context.stroke();
    context.restore();

    context.save();
    context.translate(930, 628);
    const ringGradient = context.createLinearGradient(0, -360, 0, 360);
    ringGradient.addColorStop(0, '#f7f3ff');
    ringGradient.addColorStop(0.58, '#eee5ff');
    ringGradient.addColorStop(1, '#cfbcff');
    context.fillStyle = ringGradient;
    context.shadowColor = 'rgba(78, 68, 205, 0.22)';
    context.shadowBlur = 42;
    context.beginPath();
    context.arc(0, 0, 336, 0, Math.PI * 2);
    context.arc(0, 0, 188, Math.PI * 2, 0, true);
    context.closePath();
    context.fill('evenodd');
    context.restore();

    context.save();
    context.translate(934, 736);
    const coreGradient = context.createRadialGradient(0, -112, 36, 0, 0, 268);
    coreGradient.addColorStop(0, '#7987ff');
    coreGradient.addColorStop(0.48, '#4f5df1');
    coreGradient.addColorStop(1, '#2c36b0');
    context.fillStyle = coreGradient;
    context.shadowColor = 'rgba(24, 53, 198, 0.26)';
    context.shadowBlur = 60;
    context.beginPath();
    context.ellipse(0, 0, 216, 178, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.filter = 'blur(40px)';
    context.globalAlpha = 0.24;
    context.fillStyle = 'rgba(83, 111, 255, 1)';
    context.beginPath();
    context.ellipse(944, 858, 306, 180, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.translate(1458, 1138);
    context.rotate(0.66);
    const pillGradient = context.createLinearGradient(0, -148, 0, 148);
    pillGradient.addColorStop(0, '#faf6ff');
    pillGradient.addColorStop(0.5, '#eee4ff');
    pillGradient.addColorStop(1, '#d9c6ff');
    context.fillStyle = pillGradient;
    context.shadowColor = 'rgba(84, 55, 206, 0.18)';
    context.shadowBlur = 34;
    drawRoundedRectPath(context, -88, -126, 176, 252, 88);
    context.fill();
    context.restore();

    context.save();
    context.filter = 'blur(30px)';
    context.globalAlpha = 0.38;
    const pillGlow = context.createRadialGradient(1370, 1180, 36, 1370, 1180, 186);
    pillGlow.addColorStop(0, 'rgba(255, 210, 244, 0.7)');
    pillGlow.addColorStop(1, 'rgba(255, 210, 244, 0)');
    context.fillStyle = pillGlow;
    context.fillRect(1110, 910, 420, 420);
    context.restore();

    context.save();
    context.filter = 'blur(14px)';
    context.globalAlpha = 0.3;
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.beginPath();
    context.ellipse(846, 248, 344, 58, -0.04, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.filter = 'blur(24px)';
    context.globalAlpha = 0.12;
    context.fillStyle = 'rgba(255, 255, 255, 0.8)';
    context.beginPath();
    context.ellipse(1510, 704, 208, 470, 0.22, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.filter = 'blur(10px)';
    context.globalAlpha = 0.28;
    context.fillStyle = 'rgba(154, 188, 255, 0.9)';
    context.beginPath();
    context.ellipse(1012, 1738, 596, 40, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.filter = 'blur(28px)';
    context.globalAlpha = 0.12;
    context.fillStyle = 'rgba(255, 255, 255, 0.85)';
    context.beginPath();
    context.ellipse(662, 508, 590, 450, -0.42, 0, Math.PI * 2);
    context.fill();
    context.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

function SpaceLensIcon({
    isScanning,
    isInteractive,
    pointerTargetRef,
    pointerCurrentRef,
}: {
    isScanning: boolean;
    isInteractive: boolean;
    pointerTargetRef: React.RefObject<THREE.Vector2>;
    pointerCurrentRef: React.RefObject<THREE.Vector2>;
}) {
    const groupRef = useRef<THREE.Group>(null);
    const faceTexture = useMemo(() => createSpaceLensFaceTexture(), []);

    useEffect(() => {
        return () => {
            faceTexture.dispose();
        };
    }, [faceTexture]);

    useFrame((state, delta) => {
        const group = groupRef.current;
        const pointerTarget = isInteractive && !isScanning ? pointerTargetRef.current : null;
        const pointerCurrent = pointerCurrentRef.current;

        if (!group || !pointerCurrent) {
            return;
        }

        if (pointerTarget) {
            pointerCurrent.lerp(pointerTarget, 1 - Math.exp(-delta * 5.4));
        } else {
            pointerCurrent.lerp(new THREE.Vector2(0, 0), 1 - Math.exp(-delta * 4));
        }

        const time = state.clock.elapsedTime;
        const loopX = isScanning ? Math.sin(time * 0.68) * 0.012 : Math.sin(time * 0.34) * 0.004;
        const loopY = isScanning ? Math.cos(time * 0.58) * 0.026 : Math.cos(time * 0.42) * 0.008;
        const targetRotateX = -0.045 + loopX + pointerCurrent.y * 0.03;
        const targetRotateY = loopY + pointerCurrent.x * 0.034;
        const targetLift = isScanning ? Math.sin(time * 0.88) * 0.038 : Math.sin(time * 0.7) * 0.018;

        group.rotation.x = THREE.MathUtils.damp(group.rotation.x, targetRotateX, 5.4, delta);
        group.rotation.y = THREE.MathUtils.damp(group.rotation.y, targetRotateY, 5.4, delta);
        group.rotation.z = 0;
        group.position.y = THREE.MathUtils.damp(group.position.y, targetLift, 4.8, delta);
        group.position.x = THREE.MathUtils.damp(group.position.x, isScanning ? 0 : pointerCurrent.x * 0.018, 4.8, delta);
        group.position.z = THREE.MathUtils.damp(group.position.z, 0.01, 4.8, delta);
    });

    return (
        <group ref={groupRef}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.06, -0.42]} renderOrder={0}>
                <circleGeometry args={[1.9, 64]} />
                <meshBasicMaterial color="#08011d" transparent opacity={0.22} depthWrite={false} />
            </mesh>

            <mesh position={[0, -0.16, -0.4]} renderOrder={1}>
                <sphereGeometry args={[1.54, 40, 40]} />
                <meshBasicMaterial
                    color="#0d2fff"
                    transparent
                    opacity={0.06}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>

            <RoundedBox args={[3.14, 3.14, 0.42]} radius={0.86} smoothness={10} position={[0, -0.13, -0.18]} renderOrder={2}>
                <meshPhysicalMaterial
                    color="#070f3f"
                    roughness={0.3}
                    metalness={0.06}
                    clearcoat={1}
                    clearcoatRoughness={0.18}
                    reflectivity={0.62}
                    emissive="#08156c"
                    emissiveIntensity={0.14}
                />
            </RoundedBox>

            <RoundedBox args={[3.03, 3.03, 0.52]} radius={0.84} smoothness={10} position={[0, 0, -0.01]} renderOrder={3}>
                <meshPhysicalMaterial
                    color="#3148f6"
                    roughness={0.24}
                    metalness={0.03}
                    clearcoat={1}
                    clearcoatRoughness={0.16}
                    reflectivity={0.66}
                    emissive="#1826b0"
                    emissiveIntensity={0.12}
                />
            </RoundedBox>

            <mesh position={[0, 0.03, 0.29]} renderOrder={4}>
                <planeGeometry args={[3.06, 3.06]} />
                <meshBasicMaterial
                    map={faceTexture}
                    transparent
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>

            <mesh position={[0.5, 0.22, 0.33]} renderOrder={5}>
                <planeGeometry args={[2.18, 2.48]} />
                <meshBasicMaterial
                    color="#ffffff"
                    transparent
                    opacity={0.035}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
}

export function SpaceLens3D({
    isScanning,
    windowState,
}: {
    isScanning?: boolean;
    windowState?: WindowState | null;
}) {
    const stageRef = useRef<HTMLDivElement>(null);
    const pointerTargetRef = useRef(new THREE.Vector2(0, 0));
    const pointerCurrentRef = useRef(new THREE.Vector2(0, 0));

    const scanning = Boolean(isScanning);
    const isInteractive = windowState
        ? windowState.isVisible && windowState.isFocused && !windowState.isMinimized
        : true;

    useEffect(() => {
        if (!isInteractive || scanning) {
            pointerTargetRef.current.set(0, 0);
        }
    }, [isInteractive, scanning]);

    useEffect(() => {
        const updatePointer = (event: PointerEvent) => {
            if (!isInteractive || scanning) {
                return;
            }

            const stage = stageRef.current;
            if (!stage) {
                return;
            }

            const rect = stage.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const rangeX = rect.width * 0.7;
            const rangeY = rect.height * 0.7;

            pointerTargetRef.current.set(
                clamp((event.clientX - centerX) / rangeX, -1, 1),
                clamp((event.clientY - centerY) / rangeY, -1, 1),
            );
        };

        const resetPointer = () => {
            pointerTargetRef.current.set(0, 0);
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
    }, [isInteractive, scanning]);

    return (
        <div ref={stageRef} className="space-lens-stage" aria-hidden="true">
            <div className="space-lens-glow space-lens-glow--primary" />
            <div className="space-lens-glow space-lens-glow--secondary" />
            <div className="space-lens-canvas">
                <Canvas
                    dpr={[1, 1.8]}
                    orthographic
                    camera={{ position: [0, 0.02, 8], zoom: 94 }}
                    gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
                    onCreated={({ gl }) => {
                        gl.setClearColor(0x000000, 0);
                    }}
                >
                    <ambientLight intensity={0.72} color="#b8c8ff" />
                    <hemisphereLight intensity={0.72} color="#f0dbff" groundColor="#091045" />
                    <directionalLight intensity={1.22} color="#fff7ff" position={[2.8, 3.4, 5]} />
                    <pointLight intensity={0.8} color="#295dff" position={[-2.6, 0.6, 3]} />
                    <pointLight intensity={0.78} color="#2140d1" position={[0, -2.6, 1.8]} />
                    <SpaceLensIcon
                        isScanning={scanning}
                        isInteractive={isInteractive}
                        pointerTargetRef={pointerTargetRef}
                        pointerCurrentRef={pointerCurrentRef}
                    />
                </Canvas>
            </div>
        </div>
    );
}
