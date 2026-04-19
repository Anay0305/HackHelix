import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { Bone, Group, Object3D } from "three";
import { Quaternion, Vector3 } from "three";
import { useSimulatorStore, type ArmFrame } from "@/store/simulatorStore";
import type { AvatarCue } from "@/store/simulatorStore";

/**
 * GLB-driven humanoid avatar that retargets MediaPipe arm landmarks
 * (backend pose_sequence messages) onto Mixamo-style rig bones by
 * direction-matching each bone's tail (local +Y) to a world-space target.
 *
 * Handles the two fiddly bits:
 *  1. World matrices are force-refreshed at the top of every frame and
 *     again after each bone is rotated — so the forearm picks up the
 *     upper-arm's new orientation instead of a stale one.
 *  2. Idle "arms down" target is biased slightly forward so the
 *     setFromUnitVectors shortest-arc picks the front path, not the
 *     behind-the-back path.
 */

// ── axis-convention knobs (if the character faces the other way, flip these)
const WORLD_X_SIGN = 1;   // +1: image-right = world +X
const WORLD_Y_SIGN = 1;   // +1: image-down  = world -Y (flipped inside toWorld)
const WORLD_Z_BIAS = 0.18; // small +Z bias so arms-down disambiguates to front

const LERP_ACTIVE = 0.25;
const LERP_IDLE = 0.06;

// ── helpers ──────────────────────────────────────────────────────────────────
function findBone(root: Object3D, name: string): Bone | null {
  let found: Bone | null = null;
  root.traverse((o) => {
    if (!found && (o as Bone).isBone && o.name === name) found = o as Bone;
  });
  return found;
}

/** Direction from `from` landmark to `to` landmark, in world frame. */
function dirWorld(
  from: { x: number; y: number },
  to: { x: number; y: number },
  out: Vector3,
): Vector3 {
  const dx = (to.x - from.x) * WORLD_X_SIGN;
  const dy = -(to.y - from.y) * WORLD_Y_SIGN;
  out.set(dx, dy, WORLD_Z_BIAS);
  const len = out.length();
  return len < 1e-6 ? out.set(0, -1, WORLD_Z_BIAS) : out.divideScalar(len);
}

/** Resolve the currently-active ArmFrame inside a streaming pose_sequence. */
function resolveCurrentFrame(
  ps: ReturnType<typeof useSimulatorStore.getState>["poseSequence"],
): ArmFrame | null {
  if (!ps || ps.words.length === 0) return null;
  const elapsed = performance.now() - ps.startedAt;
  const total = ps.words.reduce((a, w) => a + w.frames.length, 0);
  if (total === 0 || elapsed >= total * ps.msPerFrame) return null;
  let idx = Math.floor(elapsed / ps.msPerFrame);
  for (const w of ps.words) {
    if (idx < w.frames.length) return w.frames[idx];
    idx -= w.frames.length;
  }
  return null;
}

interface Props {
  url: string;
  onMissingClip?: (cue: AvatarCue) => void;
}

export function PoseDrivenAvatar({ url }: Props) {
  const gltf = useGLTF(url);
  const groupRef = useRef<Group>(null);

  const bones = useMemo(() => {
    const root = gltf.scene;
    return {
      rArm: findBone(root, "RightArm"),
      rFore: findBone(root, "RightForeArm"),
      lArm: findBone(root, "LeftArm"),
      lFore: findBone(root, "LeftForeArm"),
      head: findBone(root, "Head"),
    };
  }, [gltf.scene]);

  const restQuats = useRef<Map<Bone, Quaternion>>(new Map());
  useEffect(() => {
    restQuats.current.clear();
    (Object.values(bones) as (Bone | null)[]).forEach((b) => {
      if (b) restQuats.current.set(b, b.quaternion.clone());
    });
    return () => {
      restQuats.current.forEach((q, b) => b.quaternion.copy(q));
    };
  }, [bones]);

  // Reusable scratch objects
  const LOCAL_Y = useRef(new Vector3(0, 1, 0)).current;
  const IDLE_DIR = useRef(new Vector3(0, -1, WORLD_Z_BIAS).normalize()).current;
  const parentQuat = useRef(new Quaternion()).current;
  const parentQuatInv = useRef(new Quaternion()).current;
  const tmpDir = useRef(new Vector3()).current;
  const tmpLocal = useRef(new Vector3()).current;
  const tmpQuat = useRef(new Quaternion()).current;

  function pointBone(bone: Bone | null, worldDir: Vector3, slerpT: number) {
    if (!bone || !bone.parent) return;
    // Ensure parent's worldMatrix reflects any upstream bone changes
    bone.parent.updateMatrixWorld(true);
    bone.parent.getWorldQuaternion(parentQuat);
    parentQuatInv.copy(parentQuat).invert();
    tmpLocal.copy(worldDir).applyQuaternion(parentQuatInv).normalize();
    tmpQuat.setFromUnitVectors(LOCAL_Y, tmpLocal);
    bone.quaternion.slerp(tmpQuat, slerpT);
    // After slerp, refresh this bone's world matrix so its children see it
    bone.updateMatrixWorld(true);
  }

  useFrame(() => {
    const s = useSimulatorStore.getState();
    const armFrame = resolveCurrentFrame(s.poseSequence);
    const t = performance.now() / 1000;
    const active = armFrame !== null;
    const rate = active ? LERP_ACTIVE : LERP_IDLE;

    // Start from a clean world matrix state this frame
    gltf.scene.updateMatrixWorld(true);

    // ── Right arm chain ──────────────────────────────────────────────────
    const rUpperDir = armFrame
      ? dirWorld(armFrame.rs, armFrame.re, tmpDir).clone()
      : IDLE_DIR;
    pointBone(bones.rArm, rUpperDir, rate);

    const rForeDir = armFrame
      ? dirWorld(armFrame.re, armFrame.rw, tmpDir).clone()
      : IDLE_DIR;
    pointBone(bones.rFore, rForeDir, rate);

    // ── Left arm chain ───────────────────────────────────────────────────
    const lUpperDir = armFrame
      ? dirWorld(armFrame.ls, armFrame.le, tmpDir).clone()
      : IDLE_DIR;
    pointBone(bones.lArm, lUpperDir, rate);

    const lForeDir = armFrame
      ? dirWorld(armFrame.le, armFrame.lw, tmpDir).clone()
      : IDLE_DIR;
    pointBone(bones.lFore, lForeDir, rate);

    // ── Subtle idle head sway ────────────────────────────────────────────
    if (bones.head) {
      const rest = restQuats.current.get(bones.head);
      if (rest) {
        const sway = Math.sin(t * 0.9) * 0.03;
        const nod = Math.sin(t * 0.6) * 0.02;
        bones.head.quaternion.copy(rest);
        bones.head.rotateY(sway);
        bones.head.rotateX(nod);
      }
    }
  });

  return <primitive ref={groupRef} object={gltf.scene} dispose={null} />;
}

export function preloadPoseAvatar(url?: string) {
  if (url) useGLTF.preload(url);
}
