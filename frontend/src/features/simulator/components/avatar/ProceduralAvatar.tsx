import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { useSimulatorStore } from "@/store/simulatorStore";

/**
 * Bitmoji-style procedural humanoid.
 * Oversized head + chibi proportions so the avatar reads as friendly and expressive
 * even at small viewport sizes. Placeholder until the RPM .glb drops in.
 *
 * Origin of the root group is at the floor; the rig extends upward.
 */
export function ProceduralAvatar() {
  const root = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const head = useRef<Group>(null);
  const mouth = useRef<Mesh>(null);
  const leftBrow = useRef<Mesh>(null);
  const rightBrow = useRef<Mesh>(null);
  const leftHand = useRef<Group>(null);
  const rightHand = useRef<Group>(null);

  useFrame(() => {
    const s = useSimulatorStore.getState();
    const t = performance.now() / 1000;
    const isLive = s.isLive;
    const cue = s.avatarCue;
    const sentiment = s.sentiment;
    const morphs = cue?.morphTargets ?? {};

    // Breathing idle
    if (root.current) {
      root.current.position.y = Math.sin(t * 1.2) * 0.015;
    }

    // Head sway
    if (head.current) {
      const targetX =
        sentiment === "urgent" ? -0.08 : Math.sin(t * 0.8) * 0.04;
      const targetY = isLive
        ? Math.sin(t * 1.6) * 0.1
        : Math.sin(t * 0.6) * 0.03;
      head.current.rotation.x = lerp(head.current.rotation.x, targetX, 0.08);
      head.current.rotation.y = lerp(head.current.rotation.y, targetY, 0.08);
    }

    // Mouth
    if (mouth.current) {
      const smile =
        (morphs.mouthSmile ?? 0) + (sentiment === "happy" ? 0.35 : 0);
      const frown = morphs.mouthFrown ?? 0;
      const open = morphs.mouthOpen ?? 0;
      mouth.current.scale.x = lerp(
        mouth.current.scale.x,
        1 + smile * 0.5,
        0.15,
      );
      mouth.current.scale.y = lerp(
        mouth.current.scale.y,
        1 + open * 0.9 - frown * 0.3,
        0.15,
      );
    }

    // Brows
    const browInner = morphs.browInnerUp ?? 0;
    const browDown = (morphs.browDownL ?? 0 + (morphs.browDownR ?? 0)) / 2;
    if (leftBrow.current) {
      leftBrow.current.position.y = lerp(
        leftBrow.current.position.y,
        0.12 + browInner * 0.04 - browDown * 0.04,
        0.1,
      );
    }
    if (rightBrow.current) {
      rightBrow.current.position.y = lerp(
        rightBrow.current.position.y,
        0.12 + browInner * 0.04 - browDown * 0.04,
        0.1,
      );
    }

    // Arms
    const wiggle = Math.sin(t * 4) * 0.08;
    if (leftArm.current) {
      const targetRotX =
        isLive && cue ? -Math.PI / 2.4 + wiggle : -0.15 + Math.sin(t) * 0.02;
      const targetRotZ =
        isLive && cue ? 0.25 + Math.sin(t * 3) * 0.08 : 0.55;
      leftArm.current.rotation.x = lerp(
        leftArm.current.rotation.x,
        targetRotX,
        0.08,
      );
      leftArm.current.rotation.z = lerp(
        leftArm.current.rotation.z,
        targetRotZ,
        0.08,
      );
    }
    if (rightArm.current) {
      const targetRotX =
        isLive && cue ? -Math.PI / 2.2 - wiggle : -0.15 + Math.sin(t) * 0.02;
      const targetRotZ =
        isLive && cue ? -0.25 - Math.sin(t * 3) * 0.08 : -0.55;
      rightArm.current.rotation.x = lerp(
        rightArm.current.rotation.x,
        targetRotX,
        0.08,
      );
      rightArm.current.rotation.z = lerp(
        rightArm.current.rotation.z,
        targetRotZ,
        0.08,
      );
    }
    if (leftHand.current) {
      leftHand.current.rotation.z = Math.sin(t * 6) * 0.25;
    }
    if (rightHand.current) {
      rightHand.current.rotation.z = -Math.sin(t * 6) * 0.25;
    }
  });

  // Palette
  const skin = "#F5D0A9";
  const shirt = "#4F46E5";
  const shirtDark = "#3730A3";
  const hair = "#1E1B4B";
  const mouthColor = "#B91C1C";

  return (
    <group ref={root} position={[0, 0, 0]}>
      {/* Torso — shorter, narrower than before */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.55, 6, 16]} />
        <meshStandardMaterial color={shirt} roughness={0.6} />
      </mesh>

      {/* Neckline accent */}
      <mesh position={[0, 1.08, 0.02]}>
        <cylinderGeometry args={[0.17, 0.19, 0.06, 20]} />
        <meshStandardMaterial color={shirtDark} roughness={0.6} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.16, 0]}>
        <cylinderGeometry args={[0.09, 0.1, 0.12, 16]} />
        <meshStandardMaterial color={skin} roughness={0.55} />
      </mesh>

      {/* Head — oversized for bitmoji look */}
      <group ref={head} position={[0, 1.58, 0]}>
        {/* Face sphere */}
        <mesh castShadow>
          <sphereGeometry args={[0.4, 48, 40]} />
          <meshStandardMaterial color={skin} roughness={0.55} />
        </mesh>

        {/* Hair cap */}
        <mesh position={[0, 0.06, -0.01]} rotation={[-0.15, 0, 0]}>
          <sphereGeometry
            args={[0.415, 48, 24, 0, Math.PI * 2, 0, Math.PI / 1.8]}
          />
          <meshStandardMaterial color={hair} roughness={0.85} />
        </mesh>

        {/* Hair side tufts */}
        <mesh position={[-0.3, -0.05, 0.06]}>
          <sphereGeometry args={[0.14, 20, 16]} />
          <meshStandardMaterial color={hair} roughness={0.85} />
        </mesh>
        <mesh position={[0.3, -0.05, 0.06]}>
          <sphereGeometry args={[0.14, 20, 16]} />
          <meshStandardMaterial color={hair} roughness={0.85} />
        </mesh>

        {/* Ears */}
        <mesh position={[-0.4, -0.02, 0.02]}>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshStandardMaterial color={skin} roughness={0.55} />
        </mesh>
        <mesh position={[0.4, -0.02, 0.02]}>
          <sphereGeometry args={[0.06, 16, 12]} />
          <meshStandardMaterial color={skin} roughness={0.55} />
        </mesh>

        {/* Eye whites */}
        <mesh position={[-0.13, 0.03, 0.35]}>
          <sphereGeometry args={[0.062, 20, 16]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.3} />
        </mesh>
        <mesh position={[0.13, 0.03, 0.35]}>
          <sphereGeometry args={[0.062, 20, 16]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.3} />
        </mesh>
        {/* Pupils */}
        <mesh position={[-0.13, 0.03, 0.41]}>
          <sphereGeometry args={[0.03, 16, 12]} />
          <meshStandardMaterial color="#0F172A" />
        </mesh>
        <mesh position={[0.13, 0.03, 0.41]}>
          <sphereGeometry args={[0.03, 16, 12]} />
          <meshStandardMaterial color="#0F172A" />
        </mesh>
        {/* Eye highlights */}
        <mesh position={[-0.118, 0.05, 0.435]}>
          <sphereGeometry args={[0.01, 10, 8]} />
          <meshStandardMaterial
            color="#FFFFFF"
            emissive="#FFFFFF"
            emissiveIntensity={0.4}
          />
        </mesh>
        <mesh position={[0.142, 0.05, 0.435]}>
          <sphereGeometry args={[0.01, 10, 8]} />
          <meshStandardMaterial
            color="#FFFFFF"
            emissive="#FFFFFF"
            emissiveIntensity={0.4}
          />
        </mesh>

        {/* Brows */}
        <mesh
          ref={leftBrow}
          position={[-0.13, 0.12, 0.37]}
          rotation={[0, 0, -0.12]}
        >
          <boxGeometry args={[0.1, 0.018, 0.025]} />
          <meshStandardMaterial color={hair} />
        </mesh>
        <mesh
          ref={rightBrow}
          position={[0.13, 0.12, 0.37]}
          rotation={[0, 0, 0.12]}
        >
          <boxGeometry args={[0.1, 0.018, 0.025]} />
          <meshStandardMaterial color={hair} />
        </mesh>

        {/* Nose */}
        <mesh position={[0, -0.04, 0.4]}>
          <sphereGeometry args={[0.035, 16, 12]} />
          <meshStandardMaterial color="#E8B98D" roughness={0.55} />
        </mesh>

        {/* Cheek blush */}
        <mesh position={[-0.22, -0.08, 0.34]}>
          <sphereGeometry args={[0.05, 16, 12]} />
          <meshStandardMaterial
            color="#F9A8D4"
            transparent
            opacity={0.35}
            roughness={0.8}
          />
        </mesh>
        <mesh position={[0.22, -0.08, 0.34]}>
          <sphereGeometry args={[0.05, 16, 12]} />
          <meshStandardMaterial
            color="#F9A8D4"
            transparent
            opacity={0.35}
            roughness={0.8}
          />
        </mesh>

        {/* Mouth */}
        <mesh ref={mouth} position={[0, -0.17, 0.37]}>
          <boxGeometry args={[0.12, 0.022, 0.02]} />
          <meshStandardMaterial color={mouthColor} />
        </mesh>
      </group>

      {/* Left arm */}
      <group ref={leftArm} position={[-0.3, 0.98, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.45, 4, 10]} />
          <meshStandardMaterial color={shirt} roughness={0.6} />
        </mesh>
        <group ref={leftHand} position={[0, -0.6, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.1, 20, 16]} />
            <meshStandardMaterial color={skin} roughness={0.55} />
          </mesh>
        </group>
      </group>

      {/* Right arm */}
      <group ref={rightArm} position={[0.3, 0.98, 0]}>
        <mesh position={[0, -0.3, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.45, 4, 10]} />
          <meshStandardMaterial color={shirt} roughness={0.6} />
        </mesh>
        <group ref={rightHand} position={[0, -0.6, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.1, 20, 16]} />
            <meshStandardMaterial color={skin} roughness={0.55} />
          </mesh>
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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
