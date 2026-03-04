import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshTransmissionMaterial, Float, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

function Lens() {
    const groupRef = useRef<THREE.Group>(null);
    const [hovered, setHovered] = useState(false);

    useFrame((state) => {
        if (groupRef.current) {
            // Base idle rotation
            const t = state.clock.elapsedTime;
            groupRef.current.position.y = Math.sin(t * 1.5) * 0.1;

            // Mouse tracking rotation (smooth interpolation)
            const targetX = (state.pointer.x * Math.PI) / 4;
            const targetY = (state.pointer.y * Math.PI) / 4;
            groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetY, 0.1);
            groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetX, 0.1);
        }
    });

    return (
        <group
            ref={groupRef}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
        >
            <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
                {/* Outer Glass Shell */}
                <Sphere args={[1.5, 64, 64]}>
                    <MeshTransmissionMaterial
                        backside
                        backsideThickness={10}
                        thickness={hovered ? 5 : 3}
                        roughness={0}
                        transmission={1}
                        ior={1.3} // Water/Glass-like slightly refractive
                        chromaticAberration={0.1}
                        anisotropy={0.3}
                        distortion={0.5}
                        distortionScale={hovered ? 1.0 : 0.4}
                        temporalDistortion={0.2}
                        color="#ffffff"
                        attenuationDistance={1}
                        attenuationColor="#6c5ce7"
                    />
                </Sphere>

                {/* Inner glowing liquid core */}
                <Sphere args={[0.9, 64, 64]}>
                    <MeshTransmissionMaterial
                        thickness={2}
                        roughness={0.2}
                        transmission={0.9}
                        ior={1.5}
                        color="#00cec9"
                        emissive="#0984e3"
                        emissiveIntensity={hovered ? 2 : 1.2}
                    />
                </Sphere>

                {/* Floating Ring around the lens */}
                <mesh rotation={[Math.PI / 2.5, 0, 0]}>
                    <torusGeometry args={[1.9, 0.03, 32, 100]} />
                    <meshPhysicalMaterial
                        color="#dfe6e9"
                        metalness={1}
                        roughness={0.1}
                        clearcoat={1}
                        emissive="#fff"
                        emissiveIntensity={hovered ? 0.5 : 0}
                    />
                </mesh>
            </Float>
        </group>
    );
}

export function SpaceLens3D() {
    return (
        <div
            className="w-full h-full cursor-grab active:cursor-grabbing"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} color="#e0b0ff" />
                <spotLight position={[-10, -10, -10]} angle={0.15} penumbra={1} intensity={0.5} color="#00ffff" />

                <Lens />

                {/* Magical floating particles */}
                <Sparkles count={50} scale={5} size={2} speed={0.4} opacity={0.5} color="#b3e5fc" />
            </Canvas>
        </div>
    );
}
