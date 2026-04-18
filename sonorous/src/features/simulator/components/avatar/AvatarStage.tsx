import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { ProceduralAvatar } from "./ProceduralAvatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { SigningPill } from "../SigningPill";

export function AvatarStage() {
  return (
    <div
      className="relative w-full h-full rounded-xl2 overflow-hidden border border-white/5"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(139,92,246,0.15) 0%, transparent 55%), radial-gradient(ellipse at bottom right, rgba(192,81,119,0.1) 0%, transparent 55%), #0a0a0a",
      }}
    >
      {/* Floating orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-10 h-64 w-64 rounded-full bg-brand-purple/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-brand-rose/10 blur-3xl"
      />

      <SigningPill />

      <Canvas
        shadows
        camera={{ position: [0, 1.3, 3.2], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        {/* Brightened three-point lighting for dark bg */}
        <ambientLight intensity={0.75} />
        <directionalLight
          position={[3, 4, 4]}
          intensity={1.3}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-3}
          shadow-camera-right={3}
          shadow-camera-top={3}
          shadow-camera-bottom={-1}
        />
        <directionalLight
          position={[-3, 2, 2]}
          intensity={0.55}
          color="#C4B5FD"
        />
        <directionalLight
          position={[0, 2, -3]}
          intensity={0.5}
          color="#F472B6"
        />

        <Suspense fallback={null}>
          <ProceduralAvatar />
        </Suspense>

        <ContactShadows
          position={[0, 0.005, 0]}
          opacity={0.55}
          blur={2.2}
          scale={3}
          far={2}
          color="#000"
        />

        <OrbitControls
          enablePan={false}
          enableZoom={false}
          target={[0, 1.0, 0]}
          minPolarAngle={Math.PI / 2.4}
          maxPolarAngle={Math.PI / 1.9}
          minAzimuthAngle={-0.5}
          maxAzimuthAngle={0.5}
        />
      </Canvas>
    </div>
  );
}

export function AvatarFallback() {
  return (
    <div className="h-full w-full grid place-items-center glass rounded-xl2">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-48 w-32 rounded-2xl" />
        <p className="text-xs text-muted">Loading avatar…</p>
      </div>
    </div>
  );
}
