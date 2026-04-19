import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import {
  LoopOnce,
  type AnimationAction,
  type Group,
  type Mesh,
} from "three";
import { useSimulatorStore, type AvatarCue } from "@/store/simulatorStore";

/**
 * ReadyPlayerMe avatar driver.
 * - Loads .glb from a user-supplied URL
 * - Listens to `simulatorStore.avatarCue` for sign animation clips and plays them
 * - Drives ARKit blendshapes from `avatarCue.morphTargets` layered over a sentiment preset
 * - Emits onMissingClip when the backend requests a clip not bundled in the .glb,
 *   letting the parent trigger the fingerspelling fallback.
 */

// ARKit blendshape presets for our 4-valued sentiment tag.
// RPM meshes expose these standard keys via morphTargetDictionary.
const SENTIMENT_PRESETS: Record<
  "neutral" | "happy" | "urgent" | "sad",
  Record<string, number>
> = {
  neutral: {},
  happy: {
    mouthSmileLeft: 0.6,
    mouthSmileRight: 0.6,
    browOuterUpLeft: 0.25,
    browOuterUpRight: 0.25,
    cheekSquintLeft: 0.2,
    cheekSquintRight: 0.2,
  },
  urgent: {
    browInnerUp: 0.55,
    jawOpen: 0.2,
    eyeWideLeft: 0.35,
    eyeWideRight: 0.35,
  },
  sad: {
    mouthFrownLeft: 0.4,
    mouthFrownRight: 0.4,
    browInnerUp: 0.3,
    mouthShrugLower: 0.2,
  },
};

interface RPMAvatarProps {
  url: string;
  onMissingClip?: (cue: AvatarCue) => void;
}

export function RPMAvatar({ url, onMissingClip }: RPMAvatarProps) {
  const gltf = useGLTF(url);
  const group = useRef<Group>(null);
  const { actions, mixer } = useAnimations(gltf.animations, group);

  const currentAction = useRef<AnimationAction | null>(null);
  const morphMeshes = useRef<Mesh[]>([]);
  const blinkClock = useRef({ next: 2.5, open: 1 });
  const blinkElapsed = useRef(0);

  // Collect all morph-target-bearing meshes once (RPM typically has Wolf3D_Head + Teeth + Beard)
  useEffect(() => {
    const list: Mesh[] = [];
    gltf.scene.traverse((obj) => {
      const m = obj as Mesh;
      if (m.isMesh && m.morphTargetDictionary && m.morphTargetInfluences) {
        list.push(m);
      }
    });
    morphMeshes.current = list;
  }, [gltf.scene]);

  // Subscribe to avatarCue — play the requested clip or signal fallback
  useEffect(() => {
    const unsub = useSimulatorStore.subscribe(
      (s) => s.avatarCue,
      (cue) => {
        if (!cue) return;
        const action = actions[cue.clip];
        if (!action) {
          onMissingClip?.(cue);
          return;
        }
        action.reset();
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        action.fadeIn(0.18).play();
        if (currentAction.current && currentAction.current !== action) {
          currentAction.current.fadeOut(0.18);
        }
        currentAction.current = action;
      },
    );
    return unsub;
  }, [actions, onMissingClip]);

  // Per-frame driver: advance mixer, smooth blendshapes toward target, blink
  useFrame((_, delta) => {
    mixer.update(delta);
    const s = useSimulatorStore.getState();
    const cueMorphs = s.avatarCue?.morphTargets ?? {};
    const preset = SENTIMENT_PRESETS[s.sentiment] ?? {};
    const target: Record<string, number> = { ...preset, ...cueMorphs };

    // Blink timing
    blinkElapsed.current += delta;
    if (blinkElapsed.current >= blinkClock.current.next) {
      blinkClock.current.open = 0;
      if (blinkElapsed.current >= blinkClock.current.next + 0.12) {
        blinkClock.current.open = 1;
        blinkClock.current.next =
          blinkElapsed.current + 2 + Math.random() * 3;
      }
    }
    const blink = 1 - blinkClock.current.open;
    if (blink > 0) {
      target.eyeBlinkLeft = Math.max(target.eyeBlinkLeft ?? 0, blink);
      target.eyeBlinkRight = Math.max(target.eyeBlinkRight ?? 0, blink);
    }

    const smoothing = Math.min(1, delta * 9);
    for (const mesh of morphMeshes.current) {
      const dict = mesh.morphTargetDictionary!;
      const infl = mesh.morphTargetInfluences!;
      for (const name in dict) {
        const idx = dict[name];
        const want = target[name] ?? 0;
        infl[idx] += (want - infl[idx]) * smoothing;
      }
    }
  });

  return <primitive ref={group} object={gltf.scene} dispose={null} />;
}

// Preload when URL is known at module load. Safe no-op when undefined.
export function preloadRPMAvatar(url?: string) {
  if (url) useGLTF.preload(url);
}
