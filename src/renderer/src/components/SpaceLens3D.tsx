import React, { useRef } from 'react';
import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import { RoundedBox, MeshTransmissionMaterial, Environment } from "@react-three/drei"
import { EffectComposer, Bloom } from "@react-three/postprocessing"

function IconModel({ isScanning }: { isScanning?: boolean }) {
    const groupRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (groupRef.current) {
            const t = state.clock.elapsedTime;

            if (isScanning) {
                // Smooth spinning during scan
                groupRef.current.rotation.y += 0.05;
                groupRef.current.position.y = Math.sin(t * 5) * 0.1;
                groupRef.current.rotation.x = Math.sin(t * 2) * 0.1;
            } else {
                // Stable, floating mostly forward-facing icon
                groupRef.current.position.y = Math.sin(t * 1.5) * 0.05;

                // Subtle parallax rotation based on mouse
                const targetX = (state.pointer.x * Math.PI) / 12;
                const targetY = (state.pointer.y * Math.PI) / 12;

                groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetY, 0.1);
                groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetX, 0.1);
                groupRef.current.rotation.z = Math.sin(t * 0.5) * 0.02;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {/* 1) 베이스: 라운드 사각 유리 블럭 */}
            <RoundedBox
                args={[3.25, 3.25, 0.6]}     // (width, height, depth)
                radius={0.6}                // 모서리 라운드
                smoothness={14}
                position={[0, 0, 0]}
            >
                <MeshTransmissionMaterial
                    transmission={1}          // 유리 핵심
                    thickness={1.35}          // 두께감
                    roughness={0.14}          // 너무 낮으면 플라스틱, 너무 높으면 뿌연 유리
                    ior={1.45}                // 굴절률
                    chromaticAberration={0.08}
                    anisotropy={0.2}
                    distortion={0.12}
                    distortionScale={0.18}
                    temporalDistortion={0.07}
                    attenuationColor={"#6a5cff"}   // 내부 착색
                    attenuationDistance={0.65}
                    transparent
                />
            </RoundedBox>

            {/* 2) 링: 토러스(도넛) */}
            <mesh position={[-0.08, 0.25, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.78, 0.23, 56, 160]} />
                <meshPhysicalMaterial
                    color={"#ece8ff"}
                    roughness={0.18}
                    metalness={0.0}
                    transmission={0.62}
                    thickness={0.55}
                    ior={1.4}
                    clearcoat={1}
                    clearcoatRoughness={0.2}
                    envMapIntensity={1.2}
                />
            </mesh>

            {/* 3) 점: 캡슐(알약) */}
            <mesh position={[0.95, -0.35, 0.28]} rotation={[0, 0.35, 0.35]}>
                <capsuleGeometry args={[0.18, 0.38, 14, 28]} />
                <meshPhysicalMaterial
                    color={"#f2efff"}
                    roughness={0.22}
                    metalness={0.0}
                    transmission={0.55}
                    thickness={0.45}
                    ior={1.4}
                    clearcoat={1}
                    clearcoatRoughness={0.25}
                    envMapIntensity={1.2}
                />
            </mesh>
        </group>
    )
}

export function SpaceLens3D({ isScanning }: { isScanning?: boolean }) {
    return (
        <div
            className="w-full h-full cursor-grab active:cursor-grabbing"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            <Canvas
                dpr={[1, 2]}
                camera={{ position: [0, 0, 5.4], fov: 35 }}
                gl={{
                    antialias: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    outputColorSpace: THREE.SRGBColorSpace,
                }}
            >
                {/* 1) 기본광 */}
                <ambientLight intensity={0.25} />

                {/* 2) 키 라이트: 위-오른쪽 */}
                <directionalLight
                    position={[3.5, 5, 6]}
                    intensity={1.35}
                    color={"#d6ccff"}
                />

                {/* 3) 필 라이트: 아래-왼쪽 (보라톤) */}
                <directionalLight
                    position={[-6, -2.5, 2]}
                    intensity={0.75}
                    color={"#4b2dff"}
                />

                {/* 4) 프론트 포인트: 하이라이트용 */}
                <pointLight position={[0, 0.2, 4.2]} intensity={0.9} color={"#ffffff"} />

                {/* 유리에 환경맵 투영 (CSP 허용 필요) */}
                <Environment preset="city" />

                <IconModel isScanning={isScanning} />

                {/* 후처리: 살짝 블룸 */}
                <EffectComposer>
                    <Bloom intensity={0.7} luminanceThreshold={0.35} luminanceSmoothing={0.2} />
                </EffectComposer>
            </Canvas>
        </div>
    );
}
