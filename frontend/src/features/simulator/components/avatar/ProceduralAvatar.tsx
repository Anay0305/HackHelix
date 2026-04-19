import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { useSimulatorStore } from "@/store/simulatorStore";
import type { ArmFrame, ArmLandmark } from "@/store/simulatorStore";

// ─── Colours ──────────────────────────────────────────────────────────────────
const SKIN       = "#F5D0A9";
const SHIRT      = "#4F46E5";
const SHIRT_DARK = "#3730A3";
const HAIR       = "#1E1B4B";
const MOUTH_CLR  = "#B91C1C";

// ─── Math helpers ─────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }

// ─── Arm kinematics ───────────────────────────────────────────────────────────

/**
 * Map MediaPipe dy (wrist.y − shoulder.y, positive = wrist below shoulder) to
 * Three.js rotation-X around the shoulder pivot (arm hangs at rotX=0, points
 * forward at rotX≈-π/2, points straight up at rotX≈-π).
 *
 * Calibration points (empirical from hardcoded ISL poses):
 *   dy= 0.32  → rotX ≈  0.00  (arm hanging at rest)
 *   dy= 0.07  → rotX ≈ -1.24  (arm level, chest height)
 *   dy=-0.25  → rotX ≈ -2.80  (arm raised above head)
 */
function armRotX(dy: number): number {
  return clamp(4.8 * dy - 1.62, -3.1, 0.30);
}

/**
 * Map MediaPipe dx (wrist.x − shoulder.x) to rotation-Z for the RIGHT arm.
 *   dx= 0.00  → rotZ ≈ +0.38  (hanging naturally outward)
 *   dx=+0.15  → rotZ ≈ -0.13  (arm reaching inward / forward)
 *   dx=-0.25  → rotZ ≈ +1.23  (arm reaching far to the side)
 *
 * NOTE: In camera-mirrored MediaPipe, dx>0 means wrist moves to camera-right
 * which equals avatar-LEFT → arm goes inward → rotZ must decrease.
 */
function rightArmRotZ(dx: number): number {
  return clamp(0.38 - 3.4 * dx, -0.40, 1.30);
}

/**
 * Mirror formula for the LEFT arm.
 * dx>0 (camera-right = avatar-left) → arm goes inward for left arm too →
 * but inward for the left arm means toward +X → rotZ increases.
 * rotZ_left = -0.38 − 3.4 * dx  (negative base = natural outward)
 */
function leftArmRotZ(dx: number): number {
  return clamp(-0.38 - 3.4 * dx, -1.30, 0.40);
}

/**
 * Elbow bend angle (forearm rotation-X inside the upper-arm group).
 * Uses the cross-product of the upper-arm and forearm 2-D vectors.
 */
function elbowBend(
  shoulder: ArmLandmark,
  elbow: ArmLandmark,
  wrist: ArmLandmark,
): number {
  const uaX = elbow.x - shoulder.x, uaY = elbow.y - shoulder.y;
  const faX = wrist.x - elbow.x,   faY = wrist.y - elbow.y;
  const cross = Math.abs(uaX * faY - uaY * faX);
  const dot   = uaX * faX + uaY * faY;
  return Math.max(0, Math.atan2(cross, dot) * 0.60 - 0.04);
}

// ─── Finger curl ──────────────────────────────────────────────────────────────

/**
 * Estimate [0,1] curl for one finger from MediaPipe hand landmarks.
 * MediaPipe: y increases downward, so a curled finger has tip.y > mcp.y.
 */
function fingerCurl(hand: ArmLandmark[], mcpIdx: number, tipIdx: number): number {
  if (hand.length < 21) return 0;
  const dy = hand[tipIdx].y - hand[mcpIdx].y;
  return clamp(dy / 0.12 + 0.30, 0, 1);
}

function thumbCurl(hand: ArmLandmark[]): number {
  return hand.length < 5 ? 0 : fingerCurl(hand, 2, 4);
}

const MAX_CURL = Math.PI * 0.65;

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Two-phalanx finger with independently driven proximal and distal joints.
 * Both groups are exposed via refs so the parent can drive rotations in useFrame.
 */
function Finger({
  proxRef,
  distRef,
  position,
  length = 0.08,
}: {
  proxRef: React.RefObject<Group>;
  distRef: React.RefObject<Group>;
  position: [number, number, number];
  length?: number;
}) {
  const prox = length * 0.52;
  const dist = length * 0.44;
  return (
    <group position={position}>
      <group ref={proxRef}>
        {/* Proximal phalanx */}
        <mesh position={[0, -(prox * 0.5 + 0.009), 0]}>
          <capsuleGeometry args={[0.019, prox, 3, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.55} />
        </mesh>
        {/* PIP joint → distal phalanx */}
        <group ref={distRef} position={[0, -(prox + 0.018), 0]}>
          <mesh position={[0, -(dist * 0.5), 0]}>
            <capsuleGeometry args={[0.016, dist, 3, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ─── Main avatar ──────────────────────────────────────────────────────────────

export function ProceduralAvatar() {
  // ── Scene refs ──────────────────────────────────────────────────────────────
  const root      = useRef<Group>(null);
  const head      = useRef<Group>(null);
  const mouth     = useRef<Mesh>(null);
  const leftBrow  = useRef<Mesh>(null);
  const rightBrow = useRef<Mesh>(null);

  // ── Arm segment refs ────────────────────────────────────────────────────────
  const lArm     = useRef<Group>(null);   // left  upper-arm pivot (at shoulder)
  const rArm     = useRef<Group>(null);   // right upper-arm pivot
  const lFore    = useRef<Group>(null);   // left  forearm pivot (at elbow)
  const rFore    = useRef<Group>(null);   // right forearm pivot
  const lWrist   = useRef<Group>(null);   // left  wrist (wrist twist)
  const rWrist   = useRef<Group>(null);   // right wrist

  // ── Finger refs: [proximal-group, distal-group] ─────────────────────────────
  // Right hand
  const rI = [useRef<Group>(null), useRef<Group>(null)]; // index
  const rM = [useRef<Group>(null), useRef<Group>(null)]; // middle
  const rR = [useRef<Group>(null), useRef<Group>(null)]; // ring
  const rP = [useRef<Group>(null), useRef<Group>(null)]; // pinky
  const rT = [useRef<Group>(null), useRef<Group>(null)]; // thumb prox / dist
  // Left hand
  const lI = [useRef<Group>(null), useRef<Group>(null)];
  const lM = [useRef<Group>(null), useRef<Group>(null)];
  const lR = [useRef<Group>(null), useRef<Group>(null)];
  const lP = [useRef<Group>(null), useRef<Group>(null)];
  const lT = [useRef<Group>(null), useRef<Group>(null)];

  // ── Animation loop ──────────────────────────────────────────────────────────
  useFrame(() => {
    const s        = useSimulatorStore.getState();
    const t        = performance.now() / 1000;
    const isLive   = s.isLive;
    const cue      = s.avatarCue;
    const sentiment = s.sentiment;
    const morphs   = cue?.morphTargets ?? {};
    const poseSeq  = s.poseSequence;

    // Resolve current arm frame from the pose sequence timeline
    let af: ArmFrame | null = null;
    if (poseSeq && poseSeq.words.length > 0) {
      const elapsed   = performance.now() - poseSeq.startedAt;
      const totalMs   = poseSeq.words.reduce((a, w) => a + w.frames.length, 0) * poseSeq.msPerFrame;
      if (elapsed < totalMs) {
        const fi = Math.floor(elapsed / poseSeq.msPerFrame);
        let rem = fi;
        for (const word of poseSeq.words) {
          if (rem < word.frames.length) { af = word.frames[rem]; break; }
          rem -= word.frames.length;
        }
      }
    }

    // Breathing
    if (root.current)
      root.current.position.y = Math.sin(t * 1.2) * 0.015;

    // Head — negation NMM drives a side-to-side shake (~2 Hz, ±13°)
    if (head.current) {
      const isNeg = (morphs.brow_lower ?? 0) > 0;
      const tx = sentiment === "urgent" ? -0.08 : Math.sin(t * 0.8) * 0.04;
      const ty = isNeg
        ? Math.sin(t * 12.5) * 0.23          // head shake for negation
        : isLive ? Math.sin(t * 1.6) * 0.10  // active-signing sway
        : Math.sin(t * 0.6) * 0.03;          // idle drift
      const lrHead = isNeg ? 0.30 : 0.08;    // faster lerp so shake is visible
      head.current.rotation.x = lerp(head.current.rotation.x, tx, 0.08);
      head.current.rotation.y = lerp(head.current.rotation.y, ty, lrHead);
    }

    // Mouth
    if (mouth.current) {
      const smile = (morphs.mouthSmile ?? 0) + (sentiment === "happy" ? 0.35 : 0);
      mouth.current.scale.x = lerp(mouth.current.scale.x, 1 + smile * 0.5,                          0.15);
      mouth.current.scale.y = lerp(mouth.current.scale.y, 1 + (morphs.mouthOpen ?? 0) * 0.9 - (morphs.mouthFrown ?? 0) * 0.3, 0.15);
    }

    // Brows — backend sends brow_raise (question) / brow_lower (negation)
    const bi = (morphs.browInnerUp ?? 0) + (morphs.brow_raise ?? 0);
    const bd = ((morphs.browDownL ?? 0) + (morphs.browDownR ?? 0)) / 2 + (morphs.brow_lower ?? 0);
    for (const bref of [leftBrow, rightBrow])
      if (bref.current) bref.current.position.y = lerp(bref.current.position.y, 0.12 + bi * 0.04 - bd * 0.04, 0.1);

    // ── Arms ────────────────────────────────────────────────────────────────
    const lr   = af ? 0.12 : 0.055; // lerp rate — snappier when driving pose
    const wgl  = Math.sin(t * 4) * 0.05;

    // Left upper-arm
    if (lArm.current) {
      let rx: number, rz: number;
      if (af) {
        rx = armRotX(af.lw.y - af.ls.y);
        rz = leftArmRotZ(af.lw.x - af.ls.x);
      } else if (isLive && cue) {
        rx = -Math.PI / 2.4 + wgl;
        rz = -0.28 + Math.sin(t * 3) * 0.05;
      } else {
        rx = -0.10 + Math.sin(t) * 0.02;
        rz = -0.38;
      }
      lArm.current.rotation.x = lerp(lArm.current.rotation.x, rx, lr);
      lArm.current.rotation.z = lerp(lArm.current.rotation.z, rz, lr);
    }

    // Right upper-arm
    if (rArm.current) {
      let rx: number, rz: number;
      if (af) {
        rx = armRotX(af.rw.y - af.rs.y);
        rz = rightArmRotZ(af.rw.x - af.rs.x);
      } else if (isLive && cue) {
        rx = -Math.PI / 2.2 - wgl;
        rz = 0.28 - Math.sin(t * 3) * 0.05;
      } else {
        rx = -0.10 + Math.sin(t) * 0.02;
        rz = 0.38;
      }
      rArm.current.rotation.x = lerp(rArm.current.rotation.x, rx, lr);
      rArm.current.rotation.z = lerp(rArm.current.rotation.z, rz, lr);
    }

    // Forearms
    if (lFore.current) {
      const bend = af ? elbowBend(af.ls, af.le, af.lw) : (isLive && cue ? 0.30 : 0.05);
      lFore.current.rotation.x = lerp(lFore.current.rotation.x, bend, lr);
    }
    if (rFore.current) {
      const bend = af ? elbowBend(af.rs, af.re, af.rw) : (isLive && cue ? 0.30 : 0.05);
      rFore.current.rotation.x = lerp(rFore.current.rotation.x, bend, lr);
    }

    // Wrist twist (idle only)
    if (lWrist.current) lWrist.current.rotation.z = af ? 0 :  Math.sin(t * 5) * 0.12;
    if (rWrist.current) rWrist.current.rotation.z = af ? 0 : -Math.sin(t * 5) * 0.12;

    // ── Finger curls ────────────────────────────────────────────────────────
    const rh = af?.rightHand ?? [];
    const lh = af?.leftHand  ?? [];

    const rCurls = [
      fingerCurl(rh, 5,  8),   // index
      fingerCurl(rh, 9,  12),  // middle
      fingerCurl(rh, 13, 16),  // ring
      fingerCurl(rh, 17, 20),  // pinky
    ];
    const lCurls = [
      fingerCurl(lh, 5,  8),
      fingerCurl(lh, 9,  12),
      fingerCurl(lh, 13, 16),
      fingerCurl(lh, 17, 20),
    ];

    [[rI, rM, rR, rP], [lI, lM, lR, lP]].forEach((fingers, side) => {
      const curls = side === 0 ? rCurls : lCurls;
      fingers.forEach(([prox, dist], fi) => {
        const c = curls[fi];
        if (prox.current) prox.current.rotation.x = lerp(prox.current.rotation.x, c * MAX_CURL * 0.6, 0.15);
        if (dist.current) dist.current.rotation.x = lerp(dist.current.rotation.x, c * MAX_CURL,       0.15);
      });
    });

    // Thumbs (rotate around Z in thumb-base local frame)
    const rtc = thumbCurl(rh);
    if (rT[0].current) rT[0].current.rotation.z = lerp(rT[0].current.rotation.z, -rtc * 0.95, 0.15);
    if (rT[1].current) rT[1].current.rotation.z = lerp(rT[1].current.rotation.z, -rtc * 0.70, 0.15);
    const ltc = thumbCurl(lh);
    if (lT[0].current) lT[0].current.rotation.z = lerp(lT[0].current.rotation.z,  ltc * 0.95, 0.15);
    if (lT[1].current) lT[1].current.rotation.z = lerp(lT[1].current.rotation.z,  ltc * 0.70, 0.15);
  });

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <group ref={root} position={[0, 0, 0]}>

      {/* ── Torso ─────────────────────────────────────────────────────────── */}
      <mesh position={[0, 0.70, 0]} castShadow>
        <capsuleGeometry args={[0.26, 0.55, 6, 16]} />
        <meshStandardMaterial color={SHIRT} roughness={0.6} />
      </mesh>

      {/* Shoulder caps (shirt fabric over the joint) */}
      <mesh position={[-0.42, 0.97, 0.03]}>
        <sphereGeometry args={[0.085, 14, 10]} />
        <meshStandardMaterial color={SHIRT_DARK} roughness={0.65} />
      </mesh>
      <mesh position={[ 0.42, 0.97, 0.03]}>
        <sphereGeometry args={[0.085, 14, 10]} />
        <meshStandardMaterial color={SHIRT_DARK} roughness={0.65} />
      </mesh>

      {/* Neckline */}
      <mesh position={[0, 1.08, 0.02]}>
        <cylinderGeometry args={[0.17, 0.19, 0.06, 20]} />
        <meshStandardMaterial color={SHIRT_DARK} roughness={0.6} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.16, 0]}>
        <cylinderGeometry args={[0.09, 0.10, 0.12, 16]} />
        <meshStandardMaterial color={SKIN} roughness={0.55} />
      </mesh>

      {/* ── Head ──────────────────────────────────────────────────────────── */}
      <group ref={head} position={[0, 1.58, 0]}>
        {/* Skull */}
        <mesh castShadow>
          <sphereGeometry args={[0.40, 48, 40]} />
          <meshStandardMaterial color={SKIN} roughness={0.55} />
        </mesh>
        {/* Hair cap */}
        <mesh position={[0, 0.06, -0.01]} rotation={[-0.15, 0, 0]}>
          <sphereGeometry args={[0.415, 48, 24, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
          <meshStandardMaterial color={HAIR} roughness={0.85} />
        </mesh>
        {/* Side hair tufts */}
        <mesh position={[-0.30, -0.05, 0.06]}>
          <sphereGeometry args={[0.14, 20, 16]} />
          <meshStandardMaterial color={HAIR} roughness={0.85} />
        </mesh>
        <mesh position={[ 0.30, -0.05, 0.06]}>
          <sphereGeometry args={[0.14, 20, 16]} />
          <meshStandardMaterial color={HAIR} roughness={0.85} />
        </mesh>
        {/* Ears */}
        <mesh position={[-0.40, -0.02, 0.02]}>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.55} />
        </mesh>
        <mesh position={[ 0.40, -0.02, 0.02]}>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.55} />
        </mesh>
        {/* Eye whites */}
        <mesh position={[-0.13, 0.03, 0.35]}>
          <sphereGeometry args={[0.062, 20, 16]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.3} />
        </mesh>
        <mesh position={[ 0.13, 0.03, 0.35]}>
          <sphereGeometry args={[0.062, 20, 16]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.3} />
        </mesh>
        {/* Pupils */}
        <mesh position={[-0.13, 0.03, 0.41]}>
          <sphereGeometry args={[0.030, 16, 12]} />
          <meshStandardMaterial color="#0F172A" />
        </mesh>
        <mesh position={[ 0.13, 0.03, 0.41]}>
          <sphereGeometry args={[0.030, 16, 12]} />
          <meshStandardMaterial color="#0F172A" />
        </mesh>
        {/* Eye highlights */}
        <mesh position={[-0.118, 0.050, 0.435]}>
          <sphereGeometry args={[0.010, 10, 8]} />
          <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[ 0.142, 0.050, 0.435]}>
          <sphereGeometry args={[0.010, 10, 8]} />
          <meshStandardMaterial color="#FFFFFF" emissive="#FFFFFF" emissiveIntensity={0.4} />
        </mesh>
        {/* Brows */}
        <mesh ref={leftBrow}  position={[-0.13, 0.12, 0.37]} rotation={[0, 0, -0.12]}>
          <boxGeometry args={[0.10, 0.018, 0.025]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
        <mesh ref={rightBrow} position={[ 0.13, 0.12, 0.37]} rotation={[0, 0,  0.12]}>
          <boxGeometry args={[0.10, 0.018, 0.025]} />
          <meshStandardMaterial color={HAIR} />
        </mesh>
        {/* Nose */}
        <mesh position={[0, -0.04, 0.40]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshStandardMaterial color="#E8B98D" roughness={0.55} />
        </mesh>
        {/* Cheek blush */}
        <mesh position={[-0.22, -0.08, 0.34]}>
          <sphereGeometry args={[0.05, 16, 12]} />
          <meshStandardMaterial color="#F9A8D4" transparent opacity={0.35} roughness={0.8} />
        </mesh>
        <mesh position={[ 0.22, -0.08, 0.34]}>
          <sphereGeometry args={[0.05, 16, 12]} />
          <meshStandardMaterial color="#F9A8D4" transparent opacity={0.35} roughness={0.8} />
        </mesh>
        {/* Mouth */}
        <mesh ref={mouth} position={[0, -0.17, 0.37]}>
          <boxGeometry args={[0.12, 0.022, 0.02]} />
          <meshStandardMaterial color={MOUTH_CLR} />
        </mesh>
      </group>

      {/* ── LEFT ARM ──────────────────────────────────────────────────────── */}
      {/*
        Shoulder at (-0.42, 0.97, 0.03) — wider than torso radius (0.26) + clearance,
        slightly forward (z+0.03) to prevent clipping when arm swings forward.
        rotZ=-0.38 at rest → arm angles naturally outward to the left.
      */}
      <group ref={lArm} position={[-0.42, 0.97, 0.03]}>
        {/* Upper arm — shirt sleeve */}
        <mesh position={[0, -0.185, 0]} castShadow>
          <capsuleGeometry args={[0.064, 0.285, 4, 10]} />
          <meshStandardMaterial color={SHIRT} roughness={0.6} />
        </mesh>
        {/* Elbow joint (skin) */}
        <mesh position={[0, -0.365, 0]}>
          <sphereGeometry args={[0.066, 12, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.55} />
        </mesh>

        {/* Forearm — pivot at elbow centre */}
        <group ref={lFore} position={[0, -0.365, 0]}>
          <mesh position={[0, -0.125, 0]} castShadow>
            <capsuleGeometry args={[0.051, 0.205, 4, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>

          {/* Wrist + hand */}
          <group ref={lWrist} position={[0, -0.270, 0]}>
            {/* Palm */}
            <mesh position={[0, -0.038, 0]} castShadow>
              <boxGeometry args={[0.126, 0.072, 0.046]} />
              <meshStandardMaterial color={SKIN} roughness={0.55} />
            </mesh>

            {/*
              Fingers for LEFT arm — medial side (toward body) is +x.
              Order index→pinky: +x to −x.
            */}
            <Finger proxRef={lI[0]} distRef={lI[1]} position={[ 0.044, -0.104, 0]} length={0.076} />
            <Finger proxRef={lM[0]} distRef={lM[1]} position={[ 0.014, -0.110, 0]} length={0.086} />
            <Finger proxRef={lR[0]} distRef={lR[1]} position={[-0.015, -0.107, 0]} length={0.079} />
            <Finger proxRef={lP[0]} distRef={lP[1]} position={[-0.044, -0.100, 0]} length={0.064} />

            {/* Left thumb — base angled outward, curls inward (−z from outer group) */}
            <group position={[0.065, -0.030, 0]} rotation={[0, 0, -0.62]}>
              <group ref={lT[0]}>
                <mesh position={[0, -0.030, 0]}>
                  <capsuleGeometry args={[0.021, 0.045, 3, 8]} />
                  <meshStandardMaterial color={SKIN} roughness={0.55} />
                </mesh>
                <group ref={lT[1]} position={[0, -0.075, 0]}>
                  <mesh position={[0, -0.019, 0]}>
                    <capsuleGeometry args={[0.018, 0.035, 3, 8]} />
                    <meshStandardMaterial color={SKIN} roughness={0.55} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* ── RIGHT ARM ─────────────────────────────────────────────────────── */}
      {/*
        Mirror of left arm.  rotZ=+0.38 at rest → arm angles naturally outward to the right.
      */}
      <group ref={rArm} position={[0.42, 0.97, 0.03]}>
        {/* Upper arm — shirt sleeve */}
        <mesh position={[0, -0.185, 0]} castShadow>
          <capsuleGeometry args={[0.064, 0.285, 4, 10]} />
          <meshStandardMaterial color={SHIRT} roughness={0.6} />
        </mesh>
        {/* Elbow joint (skin) */}
        <mesh position={[0, -0.365, 0]}>
          <sphereGeometry args={[0.066, 12, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.55} />
        </mesh>

        {/* Forearm */}
        <group ref={rFore} position={[0, -0.365, 0]}>
          <mesh position={[0, -0.125, 0]} castShadow>
            <capsuleGeometry args={[0.051, 0.205, 4, 10]} />
            <meshStandardMaterial color={SKIN} roughness={0.55} />
          </mesh>

          {/* Wrist + hand */}
          <group ref={rWrist} position={[0, -0.270, 0]}>
            {/* Palm */}
            <mesh position={[0, -0.038, 0]} castShadow>
              <boxGeometry args={[0.126, 0.072, 0.046]} />
              <meshStandardMaterial color={SKIN} roughness={0.55} />
            </mesh>

            {/*
              Fingers for RIGHT arm — medial side (toward body) is −x.
              Order index→pinky: −x to +x.
            */}
            <Finger proxRef={rI[0]} distRef={rI[1]} position={[-0.044, -0.104, 0]} length={0.076} />
            <Finger proxRef={rM[0]} distRef={rM[1]} position={[-0.014, -0.110, 0]} length={0.086} />
            <Finger proxRef={rR[0]} distRef={rR[1]} position={[ 0.015, -0.107, 0]} length={0.079} />
            <Finger proxRef={rP[0]} distRef={rP[1]} position={[ 0.044, -0.100, 0]} length={0.064} />

            {/* Right thumb — mirror of left */}
            <group position={[-0.065, -0.030, 0]} rotation={[0, 0, 0.62]}>
              <group ref={rT[0]}>
                <mesh position={[0, -0.030, 0]}>
                  <capsuleGeometry args={[0.021, 0.045, 3, 8]} />
                  <meshStandardMaterial color={SKIN} roughness={0.55} />
                </mesh>
                <group ref={rT[1]} position={[0, -0.075, 0]}>
                  <mesh position={[0, -0.019, 0]}>
                    <capsuleGeometry args={[0.018, 0.035, 3, 8]} />
                    <meshStandardMaterial color={SKIN} roughness={0.55} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* Floor disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[1.1, 48]} />
        <meshStandardMaterial color="#E0E7FF" roughness={1} />
      </mesh>
    </group>
  );
}
