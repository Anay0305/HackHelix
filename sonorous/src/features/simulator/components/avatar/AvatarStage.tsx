import { Component, Suspense, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { ProceduralAvatar } from "./ProceduralAvatar";
import { RPMAvatar, preloadRPMAvatar } from "./RPMAvatar";
import { FingerspellOverlay } from "./FingerspellOverlay";
import { Skeleton } from "@/components/ui/Skeleton";
import { SigningPill } from "../SigningPill";
import { useSimulatorStore, type AvatarCue } from "@/store/simulatorStore";
import { env } from "@/lib/env";

preloadRPMAvatar(env.rpmAvatarUrl);

export function AvatarStage() {
  const [rpmFailed, setRpmFailed] = useState(false);
  const [fingerspellWord, setFingerspellWord] = useState<string | null>(null);
  const glossTokens = useSimulatorStore((s) => s.glossTokens);
  const sourceText = useSimulatorStore((s) => s.sourceText);

  // When a cue arrives for a clip the RPM model doesn't contain, fall back
  // to fingerspelling the most relevant word (last gloss token, else sourceText).
  const handleMissingClip = useCallback(
    (_cue: AvatarCue) => {
      const lastGloss = glossTokens[glossTokens.length - 1]?.gloss;
      const word = (lastGloss || sourceText || "").replace(/[^A-Za-z]/g, "");
      if (word) setFingerspellWord(word.toUpperCase());
    },
    [glossTokens, sourceText],
  );

  // Reset fingerspell state when a new cue successfully plays (detected by cue changing while word cleared)
  useEffect(() => {
    if (!fingerspellWord) return;
    // Auto-clear after max word length * letter interval + buffer
    const maxMs = Math.max(2000, fingerspellWord.length * 240 + 400);
    const t = setTimeout(() => setFingerspellWord(null), maxMs);
    return () => clearTimeout(t);
  }, [fingerspellWord]);

  const useRpm = Boolean(env.rpmAvatarUrl) && !rpmFailed;

  return (
    <div
      className="relative w-full h-full rounded-2xl overflow-hidden border border-white/10"
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
        camera={{ position: [0, 1.45, 2.4], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
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
          {useRpm && env.rpmAvatarUrl ? (
            <RpmBoundary onError={() => setRpmFailed(true)}>
              <RPMAvatar
                url={env.rpmAvatarUrl}
                onMissingClip={handleMissingClip}
              />
            </RpmBoundary>
          ) : (
            <ProceduralAvatar />
          )}
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
          target={[0, 1.25, 0]}
          minPolarAngle={Math.PI / 2.4}
          maxPolarAngle={Math.PI / 1.9}
          minAzimuthAngle={-0.5}
          maxAzimuthAngle={0.5}
        />
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
