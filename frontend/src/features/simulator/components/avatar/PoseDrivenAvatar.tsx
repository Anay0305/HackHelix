import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { Bone, Group, Object3D } from "three";
import { Quaternion, Vector3 } from "three";
import { useSimulatorStore, type ArmFrame, type ArmLandmark } from "@/store/simulatorStore";
import type { AvatarCue } from "@/store/simulatorStore";

/**
 * Full-body MediaPipe → Mixamo bone retargeter.
 *
 * Drives:
 *   - Left/Right Arm + ForeArm  (shoulder→elbow, elbow→wrist)
 *   - 20 finger bones            (Thumb/Index/Middle/Ring/Pinky × 3 joints × 2 hands)
 *   - Head                       (idle sway)
 *
 * Algorithm: for each bone, compute a desired world-space direction from
 * the parent→child landmark pair, transform it into the bone's parent
 * local frame, then slerp the bone's quaternion toward
 * setFromUnitVectors(local +Y, desiredLocal).
 */

// ── Coordinate mapping ───────────────────────────────────────────────────────
// MediaPipe: x ∈ [0,1] left→right, y ∈ [0,1] top→bottom (both body + hand)
// World: right = +X, up = +Y, slight +Z keeps arms/fingers in front of body.
const WORLD_X_SIGN = 1;
const WORLD_Y_SIGN = 1;
const ARM_Z_BIAS   = 0.18;  // arm idle bias toward front
const HAND_Z_BIAS  = 0.30;  // fingers need a stronger forward push

const LERP_ARMS    = 0.25;
const LERP_FINGERS = 0.40;  // fingers snap faster between handshapes
const LERP_IDLE    = 0.06;

// ── MediaPipe → Mixamo finger bone pairs ──────────────────────────────────────
// Each entry: bone suffix (e.g. "Thumb1"), from-landmark index, to-landmark index
// MediaPipe hand: 0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
const FINGER_PAIRS: Array<{ suffix: string; from: number; to: number }> = [
  { suffix: "Thumb1",  from: 1,  to: 2  },
  { suffix: "Thumb2",  from: 2,  to: 3  },
  { suffix: "Thumb3",  from: 3,  to: 4  },
  { suffix: "Index1",  from: 5,  to: 6  },
  { suffix: "Index2",  from: 6,  to: 7  },
  { suffix: "Index3",  from: 7,  to: 8  },
  { suffix: "Middle1", from: 9,  to: 10 },
  { suffix: "Middle2", from: 10, to: 11 },
  { suffix: "Middle3", from: 11, to: 12 },
  { suffix: "Ring1",   from: 13, to: 14 },
  { suffix: "Ring2",   from: 14, to: 15 },
  { suffix: "Ring3",   from: 15, to: 16 },
  { suffix: "Pinky1",  from: 17, to: 18 },
  { suffix: "Pinky2",  from: 18, to: 19 },
  { suffix: "Pinky3",  from: 19, to: 20 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function findBone(root: Object3D, name: string): Bone | null {
  let found: Bone | null = null;
  root.traverse((o) => {
    if (!found && (o as Bone).isBone && o.name === name) found = o as Bone;
  });
  return found;
}

function dirWorld(
  from: ArmLandmark,
  to: ArmLandmark,
  out: Vector3,
  zBias = ARM_Z_BIAS,
): Vector3 {
  const dx = (to.x - from.x) * WORLD_X_SIGN;
  const dy = -(to.y - from.y) * WORLD_Y_SIGN;
  out.set(dx, dy, zBias);
  const len = out.length();
  return len < 1e-6 ? out.set(0, -1, zBias) : out.divideScalar(len);
}

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

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  url: string;
  onMissingClip?: (cue: AvatarCue) => void;
}

export function PoseDrivenAvatar({ url }: Props) {
  const gltf = useGLTF(url);
  const groupRef = useRef<Group>(null);

  // ── Arm bones ──────────────────────────────────────────────────────────────
  const armBones = useMemo(() => ({
    rArm:  findBone(gltf.scene, "RightArm"),
    rFore: findBone(gltf.scene, "RightForeArm"),
    lArm:  findBone(gltf.scene, "LeftArm"),
    lFore: findBone(gltf.scene, "LeftForeArm"),
    head:  findBone(gltf.scene, "Head"),
  }), [gltf.scene]);

  // ── Finger bones: Left + Right × 15 (5 fingers × 3 joints) ───────────────
  const fingerBones = useMemo(() => {
    const map: Record<string, Bone | null> = {};
    for (const side of ["Left", "Right"] as const) {
      for (const { suffix } of FINGER_PAIRS) {
        const name = `${side}Hand${suffix}`;
        map[name] = findBone(gltf.scene, name);
      }
    }
    return map;
  }, [gltf.scene]);

  // Cache rest-pose quaternions for head sway
  const restQuats = useRef<Map<Bone, Quaternion>>(new Map());
  useEffect(() => {
    restQuats.current.clear();
    const allBones = [
      ...Object.values(armBones),
      ...Object.values(fingerBones),
    ] as (Bone | null)[];
    allBones.forEach((b) => {
      if (b) restQuats.current.set(b, b.quaternion.clone());
    });
    return () => { restQuats.current.forEach((q, b) => b.quaternion.copy(q)); };
  }, [armBones, fingerBones]);

  // Scratch objects — allocated once, reused every frame
  const LOCAL_Y       = useRef(new Vector3(0, 1, 0)).current;
  const IDLE_ARM_DIR  = useRef(new Vector3(0, -1, ARM_Z_BIAS).normalize()).current;
  const IDLE_FING_DIR = useRef(new Vector3(0, -1, HAND_Z_BIAS).normalize()).current;
  const pQuat         = useRef(new Quaternion()).current;
  const pQuatInv      = useRef(new Quaternion()).current;
  const tmpDir        = useRef(new Vector3()).current;
  const tmpLocal      = useRef(new Vector3()).current;
  const tmpQ          = useRef(new Quaternion()).current;

  function pointBone(bone: Bone | null, worldDir: Vector3, t: number) {
    if (!bone?.parent) return;
    bone.parent.updateMatrixWorld(true);
    bone.parent.getWorldQuaternion(pQuat);
    pQuatInv.copy(pQuat).invert();
    tmpLocal.copy(worldDir).applyQuaternion(pQuatInv).normalize();
    tmpQ.setFromUnitVectors(LOCAL_Y, tmpLocal);
    bone.quaternion.slerp(tmpQ, t);
    bone.updateMatrixWorld(true);
  }

  // ── Drive a full hand's 15 bones from a 21-landmark array ─────────────────
  function driveHand(
    landmarks: ArmLandmark[] | undefined,
    side: "Left" | "Right",
    rate: number,
  ) {
    if (!landmarks || landmarks.length < 21) {
      // Idle: relax each finger bone toward slightly-curled rest
      for (const { suffix } of FINGER_PAIRS) {
        pointBone(fingerBones[`${side}Hand${suffix}`], IDLE_FING_DIR, LERP_IDLE);
      }
      return;
    }
    for (const { suffix, from, to } of FINGER_PAIRS) {
      const fromLm = landmarks[from];
      const toLm   = landmarks[to];
      if (!fromLm || !toLm) continue;
      dirWorld(fromLm, toLm, tmpDir, HAND_Z_BIAS);
      pointBone(fingerBones[`${side}Hand${suffix}`], tmpDir.clone(), rate);
    }
  }

  useFrame(() => {
    const s = useSimulatorStore.getState();
    const frame = resolveCurrentFrame(s.poseSequence);
    const t = performance.now() / 1000;
    const active = frame !== null;
    const armRate  = active ? LERP_ARMS    : LERP_IDLE;
    const fingRate = active ? LERP_FINGERS : LERP_IDLE;

    gltf.scene.updateMatrixWorld(true);

    // Right arm
    pointBone(armBones.rArm,  frame ? dirWorld(frame.rs, frame.re, tmpDir).clone() : IDLE_ARM_DIR, armRate);
    pointBone(armBones.rFore, frame ? dirWorld(frame.re, frame.rw, tmpDir).clone() : IDLE_ARM_DIR, armRate);

    // Left arm
    pointBone(armBones.lArm,  frame ? dirWorld(frame.ls, frame.le, tmpDir).clone() : IDLE_ARM_DIR, armRate);
    pointBone(armBones.lFore, frame ? dirWorld(frame.le, frame.lw, tmpDir).clone() : IDLE_ARM_DIR, armRate);

    // Right hand fingers
    driveHand(frame?.rightHand, "Right", fingRate);

    // Left hand fingers
    driveHand(frame?.leftHand,  "Left",  fingRate);

    // Head idle sway
    if (armBones.head) {
      const rest = restQuats.current.get(armBones.head);
      if (rest) {
        armBones.head.quaternion.copy(rest);
        armBones.head.rotateY(Math.sin(t * 0.9) * 0.03);
        armBones.head.rotateX(Math.sin(t * 0.6) * 0.02);
      }
    }
  });

  return <primitive ref={groupRef} object={gltf.scene} dispose={null} />;
}

export function preloadPoseAvatar(url?: string) {
  if (url) useGLTF.preload(url);
}
