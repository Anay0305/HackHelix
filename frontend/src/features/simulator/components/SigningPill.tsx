import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useSimulatorStore } from "@/store/simulatorStore";

/**
 * Floating glass pill over the avatar stage.
 * Reads isLive + mode from the simulator store; text switches by direction.
 * Pulse animation is disabled when user prefers reduced motion.
 */
export function SigningPill() {
  const isLive = useSimulatorStore((s) => s.isLive);
  const mode = useSimulatorStore((s) => s.mode);
  const reduce = useReducedMotion();

  const text =
    mode === "speech2isl"
      ? "Translating speech\u2026"
      : "User is signing\u2026";

  return (
    <AnimatePresence>
      {isLive && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: reduce ? 1 : [1, 1.03, 1],
          }}
          transition={{
            opacity: { duration: 0.25 },
            y: { duration: 0.25 },
            scale: reduce
              ? { duration: 0 }
              : { duration: 2, repeat: Infinity, ease: "easeInOut" },
          }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
        >
          <div className="glass-strong rounded-full pl-3 pr-4 py-2 flex items-center gap-2 border border-brand-purple/30 shadow-glow-brand">
            <span
              aria-hidden
              className="relative flex h-2 w-2"
            >
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-purple opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-purple" />
            </span>
            <Sparkles className="h-3.5 w-3.5 text-brand-purple" aria-hidden />
            <span className="text-xs font-medium text-ink">{text}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
