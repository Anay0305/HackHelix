/**
 * HandOverlay — draws MediaPipe hand skeleton over a <video> element.
 * Each finger is coloured based on per-finger match score:
 *   green  ≥ 70   yellow 40-69   red < 40
 *
 * Usage:
 *   <div style={{ position:'relative' }}>
 *     <video ref={videoRef} ... />
 *     <HandOverlay landmarks={landmarks21} fingerScores={fingerScores} score={overall} />
 *   </div>
 */

import type { CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

interface Lm { x: number; y: number; z?: number }

interface Props {
  landmarks: Lm[] | null;           // 21 MediaPipe hand landmarks (normalized 0-1)
  fingerScores: Record<string, number>;
  score: number;
  mirrored?: boolean;               // flip horizontally to match selfie view
}

// MediaPipe hand connections
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],           // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],            // index
  [0, 9], [9, 10], [10, 11], [11, 12],        // middle
  [0, 13], [13, 14], [14, 15], [15, 16],      // ring
  [0, 17], [17, 18], [18, 19], [19, 20],      // pinky
  [5, 9], [9, 13], [13, 17],                  // palm
];

const FINGER_IDS: Record<string, number[]> = {
  thumb:  [1, 2, 3, 4],
  index:  [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring:   [13, 14, 15, 16],
  pinky:  [17, 18, 19, 20],
};

function scoreColor(s: number): string {
  if (s >= 70) return "#10B981"; // green
  if (s >= 40) return "#F59E0B"; // amber
  return "#EF4444";              // red
}

function fingerForNode(idx: number): string {
  for (const [f, ids] of Object.entries(FINGER_IDS)) {
    if (ids.includes(idx)) return f;
  }
  return "palm";
}

export function HandOverlay({ landmarks, fingerScores, score, mirrored = true }: Props) {
  if (!landmarks || landmarks.length < 21) return null;

  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  };
  if (mirrored) style.transform = "scaleX(-1)";

  const scoreColor_ = scoreColor(score);

  return (
    <div style={style}>
      <svg
        viewBox="0 0 1 1"
        width="100%"
        height="100%"
        style={{ overflow: "visible" }}
      >
        {/* Connections */}
        {CONNECTIONS.map(([a, b]) => {
          const pa = landmarks[a];
          const pb = landmarks[b];
          const finger = fingerForNode(a);
          const fs = fingerScores[finger] ?? 50;
          const color = scoreColor(fs);
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x} y1={pa.y}
              x2={pb.x} y2={pb.y}
              stroke={color}
              strokeWidth="0.006"
              strokeLinecap="round"
              opacity={0.85}
            />
          );
        })}
        {/* Landmark dots */}
        {landmarks.map((lm, i) => {
          const finger = fingerForNode(i);
          const fs = fingerScores[finger] ?? 50;
          return (
            <circle
              key={i}
              cx={lm.x} cy={lm.y}
              r={i === 0 ? 0.014 : 0.009}
              fill={scoreColor(fs)}
              opacity={0.9}
            />
          );
        })}
      </svg>

      {/* Score badge */}
      <AnimatePresence>
        <motion.div
          key={Math.round(score / 5)}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn(
            "absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-full",
            score >= 70
              ? "bg-emerald-500/90 text-white"
              : score >= 40
                ? "bg-amber-500/90 text-white"
                : "bg-red-500/90 text-white",
          )}
          style={{ color: "#fff" }}
        >
          {score}%
        </motion.div>
      </AnimatePresence>

      {/* Full-screen green flash when passing */}
      <AnimatePresence>
        {score >= 65 && (
          <motion.div
            key="pass"
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0 bg-emerald-400/20 rounded-xl"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
