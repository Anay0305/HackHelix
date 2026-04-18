import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

interface Tier {
  outer: string;
  inner: string;
  core: string;
  glow: string;
  scale: number;
}

function tierFor(days: number): Tier {
  if (days >= 30) {
    return {
      outer: "#8B5CF6",
      inner: "#60A5FA",
      core: "#DBEAFE",
      glow: "rgba(139, 92, 246, 0.65)",
      scale: 1.15,
    };
  }
  if (days >= 7) {
    return {
      outer: "#F97316",
      inner: "#FBBF24",
      core: "#FEF3C7",
      glow: "rgba(249, 115, 22, 0.6)",
      scale: 1.08,
    };
  }
  if (days >= 3) {
    return {
      outer: "#F97316",
      inner: "#FBBF24",
      core: "#FEF3C7",
      glow: "rgba(249, 115, 22, 0.4)",
      scale: 1,
    };
  }
  if (days >= 1) {
    return {
      outer: "#FB923C",
      inner: "#FCD34D",
      core: "#FFF7ED",
      glow: "rgba(251, 146, 60, 0.3)",
      scale: 0.92,
    };
  }
  return {
    outer: "#52525B",
    inner: "#71717A",
    core: "#A1A1AA",
    glow: "rgba(82, 82, 91, 0.1)",
    scale: 0.85,
  };
}

export function StreakFlame({
  days,
  className,
}: {
  days: number;
  className?: string;
}) {
  const tier = tierFor(days);
  const inert = days === 0;

  return (
    <motion.div
      className={cn("relative inline-flex", className)}
      style={{
        filter: `drop-shadow(0 0 12px ${tier.glow})`,
      }}
      animate={
        inert
          ? undefined
          : {
              scale: [tier.scale, tier.scale * 1.04, tier.scale],
            }
      }
      transition={{
        duration: 1.8,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <svg
        width="44"
        height="44"
        viewBox="0 0 44 44"
        fill="none"
        aria-hidden
      >
        <path
          d="M22 4 C24 10, 30 14, 30 22 C30 28, 26 34, 22 40 C18 34, 14 28, 14 22 C14 14, 20 10, 22 4 Z"
          fill={tier.outer}
          opacity={inert ? 0.4 : 1}
        />
        <path
          d="M22 12 C23.5 16, 27 19, 27 24 C27 28, 25 32, 22 36 C19 32, 17 28, 17 24 C17 19, 20.5 16, 22 12 Z"
          fill={tier.inner}
          opacity={inert ? 0.5 : 1}
        />
        <path
          d="M22 19 C22.8 22, 24.5 23.5, 24.5 26 C24.5 29, 22 32, 22 32 C22 32, 19.5 29, 19.5 26 C19.5 23.5, 21.2 22, 22 19 Z"
          fill={tier.core}
          opacity={inert ? 0.5 : 1}
        />
      </svg>
    </motion.div>
  );
}
