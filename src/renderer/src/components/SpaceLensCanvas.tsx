import React, { useRef } from 'react';
import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import { RoundedBox, MeshTransmissionMaterial } from "@react-three/drei"

function IconModel({ isScanning }: { isScanning?: boolean }) {
    const groupRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (groupRef.current) {
            const t = state.clock.elapsedTime;

            if (isScanning) {
                groupRef.current.rotation.y += 0.05;
                groupRef.current.position.y = Math.sin(t * 5) * 0.1;
                groupRef.current.rotation.x = Math.sin(t * 2) * 0.1;
            } else {
                groupRef.current.position.y = Math.sin(t * 1.5) * 0.05;

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
            <RoundedBox
                args={[3.25, 3.25, 0.6]}
                radius={0.6}
                smoothness={14}
                position={[0, 0, 0]}
            >
                <MeshTransmissionMaterial
                    transmission={1}
                    thickness={1.35}
                    roughness={0.14}
                    ior={1.45}
                    chromaticAberration={0.08}
                    anisotropy={0.2}
                    distortion={0.12}
                    distortionScale={0.18}
                    temporalDistortion={0.07}
                    attenuationColor={"#6a5cff"}
                    attenuationDistance={0.65}
                    transparent
                />
            </RoundedBox>

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

export default function SpaceLensCanvas({ isScanning }: { isScanning?: boolean }) {
    return (
        <div
            className="w-full h-full cursor-grab active:cursor-grabbing"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            <Canvas
                dpr={1}
                camera={{ position: [0, 0, 5.4], fov: 35 }}
                gl={{
                    antialias: false,
                    powerPreference: "low-power",
                    toneMapping: THREE.ACESFilmicToneMapping,
                    outputColorSpace: THREE.SRGBColorSpace,
                }}
            >
                <ambientLight intensity={0.25} />
                <directionalLight
                    position={[3.5, 5, 6]}
                    intensity={1.35}
                    color={"#d6ccff"}
                />
                <directionalLight
                    position={[-6, -2.5, 2]}
                    intensity={0.75}
                    color={"#4b2dff"}
                />
                <pointLight position={[0, 0.2, 4.2]} intensity={0.9} color={"#ffffff"} />
                <IconModel isScanning={isScanning} />
            </Canvas>
        </div>
    );
}
