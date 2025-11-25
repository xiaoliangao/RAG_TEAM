// src/components/ZenNeuralJellyfish.tsx
import React, { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { motion } from "framer-motion";

type JellyfishMaterial = THREE.ShaderMaterial & {
  uniforms: {
    u_time: { value: number };
    u_intensity: { value: number };
    u_colorMix: { value: number };
  };
};

const vertexShader = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float u_time;
  uniform float u_intensity;

  // simple hash-based noise
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float n = mix(
      mix(
        mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
    return n;
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;

    float t = u_time * 0.6;
    float n = noise(normal * 2.0 + vec3(t * 0.3, t * 0.2, t * 0.15));
    float displacement = (n - 0.5) * 0.5 * u_intensity;

    vec3 newPosition = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float u_time;
  uniform float u_colorMix;

  void main() {
    vec3 n = normalize(vNormal);

    // fresnel-like glow
    float fresnel = pow(1.0 - dot(n, vec3(0.0, 0.0, 1.0)), 2.0);

    vec3 colorA = vec3(0.66, 0.33, 0.97); // neon purple
    vec3 colorB = vec3(0.02, 0.72, 0.83); // cyan

    float t = 0.5 + 0.5 * sin(u_time * 0.7 + u_colorMix * 2.0);
    vec3 base = mix(colorA, colorB, t);

    float glow = fresnel * 1.3 + 0.2;
    vec3 finalColor = base * glow;

    // alpha 稍微高一点，背景浅色也能看清
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const JellyfishMesh: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<JellyfishMaterial | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!hovered) return;
    const id = setInterval(() => setPulse((p) => p + 1), 1200);
    return () => clearInterval(id);
  }, [hovered]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    if (materialRef.current) {
      materialRef.current.uniforms.u_time.value = t;

      const targetIntensity = hovered ? 1.5 : 1.0;
      materialRef.current.uniforms.u_intensity.value =
        THREE.MathUtils.lerp(
          materialRef.current.uniforms.u_intensity.value,
          targetIntensity,
          0.04
        ) +
        0.03 * Math.sin(t * 2.0 + pulse);

      materialRef.current.uniforms.u_colorMix.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.u_colorMix.value,
        hovered ? 1.0 : 0.0,
        0.05
      );
    }

    if (meshRef.current) {
      meshRef.current.rotation.y += 0.003 + (hovered ? 0.002 : 0);
      meshRef.current.rotation.x = THREE.MathUtils.lerp(
        meshRef.current.rotation.x,
        hovered ? 0.2 : 0.05,
        0.04
      );
      meshRef.current.position.y = Math.sin(t * 0.6) * 0.18;
    }
  });

  const handleClick = () => {
    if (!materialRef.current) return;
    // 小小的“喂食”冲击
    materialRef.current.uniforms.u_intensity.value += 0.6;
    materialRef.current.uniforms.u_colorMix.value = 1.0;
    setTimeout(() => {
      if (materialRef.current) {
        materialRef.current.uniforms.u_intensity.value -= 0.5;
      }
    }, 650);
  };

  return (
    <mesh
      ref={meshRef}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onClick={handleClick}
      scale={1.25}
      castShadow
      receiveShadow
    >
      <icosahedronGeometry args={[1.1, 48]} />
      <shaderMaterial
        ref={materialRef}
        attach="material"
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        side={THREE.FrontSide}
        transparent={false}
        blending={THREE.NormalBlending}
        toneMapped={false}
        depthWrite={true}
        uniforms={{
          u_time: { value: 0 },
          u_intensity: { value: 1.0 },
          u_colorMix: { value: 0 },
        }}
      />
    </mesh>
  );
};

const ZenNeuralJellyfish: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="relative w-full h-[380px] md:h-[440px] xl:h-[520px] mt-8 rounded-3xl backdrop-blur-xl bg-slate-900/40 border border-white/15 shadow-[0_0_40px_rgba(15,23,42,0.45)] overflow-hidden transition duration-300 ease-out hover:border-violet-300/70 hover:shadow-[0_0_70px_rgba(129,140,248,0.65)]"
    >
      <div className="absolute top-3 left-4 text-[11px] font-mono uppercase tracking-[0.2em] text-slate-200/70 z-10">
        Neural Companion · Zen Mode
      </div>

      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        dpr={[1, 2]}
        className="absolute inset-0"
        gl={{ alpha: true, antialias: true }}
      >
        {/* 略微深一点的背景，让发光体更明显 */}
        <color attach="background" args={["#020617"]} />
        <ambientLight intensity={0.5} />
        <pointLight position={[3, 4, 5]} intensity={1.4} color={"#a855f7"} />
        <pointLight position={[-3, -2, -4]} intensity={1.0} color={"#06b6d4"} />
        <JellyfishMesh />
      </Canvas>

      {/* 轻微的叠加光晕 */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_15%,rgba(168,85,247,0.25),transparent_55%),radial-gradient(circle_at_15%_85%,rgba(56,189,248,0.2),transparent_50%)]" />
    </motion.div>
  );
};

export default ZenNeuralJellyfish;
