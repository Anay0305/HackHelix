import { Component, Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import { ProceduralAvatar } from "./ProceduralAvatar";
import { preloadRPMAvatar } from "./RPMAvatar";
import { preloadPoseAvatar } from "./PoseDrivenAvatar";
import { SequencerAvatar, preloadSequencerAvatar } from "./SequencerAvatar";
import { FingerspellOverlay } from "./FingerspellOverlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { SigningPill } from "../SigningPill";
import { env } from "@/lib/env";

preloadRPMAvatar(env.rpmAvatarUrl);
preloadPoseAvatar(env.rpmAvatarUrl);
preloadSequencerAvatar();

export function AvatarStage() {
  const [rpmFailed, setRpmFailed] = useState(false);
  const [fingerspellWord, setFingerspellWord] = useState<string | null>(null);

  // Auto-clear the fingerspell overlay after the iteration finishes.
  useEffect(() => {
    if (!fingerspellWord) return;
    const maxMs = Math.max(2000, fingerspellWord.length * 240 + 400);
    const t = setTimeout(() => setFingerspellWord(null), maxMs);
    return () => clearTimeout(t);
  }, [fingerspellWord]);

  return (
    <div
      className="relative w-full h-[500px] md:h-full min-h-[400px] rounded-2xl overflow-hidden border border-white/10"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(139,92,246,0.18) 0%, transparent 55%), radial-gradient(ellipse at bottom right, rgba(192,81,119,0.12) 0%, transparent 55%), #0a0a0a",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -left-10 h-64 w-64 rounded-full bg-[#8B5CF6]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-[#C05177]/10 blur-3xl"
      />

      <SigningPill />
      <FingerspellOverlay
        word={fingerspellWord}
        onDone={() => setFingerspellWord(null)}
      />

      <Canvas
        shadows
        camera={{ position: [0, 1.55, 2.0], fov: 48 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        {/* Bulletproof lighting — model is invisible without these */}
        <ambientLight intensity={1.5} />
        <directionalLight position={[0, 2, 5]} intensity={2} />

        {/* useGLTF suspends — Avatar must be inside a Suspense boundary */}
        <Suspense
          fallback={
            <Html center>
              <div className="text-white text-sm font-inter">
                Loading 3D Model…
              </div>
            </Html>
          }
        >
          <RpmBoundary onError={() => setRpmFailed(true)}>
            {rpmFailed ? <ProceduralAvatar /> : <SequencerAvatar />}
          </RpmBoundary>
        </Suspense>

        <ContactShadows
          position={[0, 0.005, 0]}
          opacity={0.55}
          blur={2.2}
          scale={3}
          far={2}
          color="#000"
        />

        {/* Temporarily unrestricted — pan/zoom around to find the model */}
        <OrbitControls enableZoom={true} />
      </Canvas>
    </div>
  );
}

/**
 * Catches Suspense/GLTF load errors from the RPM pipeline and notifies the parent
 * so it can fall back to the procedural avatar. Keeps the demo alive when the
 * RPM URL is unreachable, malformed, or missing animations entirely.
 */
class RpmBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function AvatarFallback() {
  return (
    <div className="h-full w-full grid place-items-center bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-48 w-32 rounded-2xl" />
        <p className="text-xs text-zinc-500 font-inter">Loading avatar…</p>
      </div>
    </div>
  );
}
