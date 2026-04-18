import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

interface FingerspellOverlayProps {
  word: string | null;
  onDone?: () => void;
  letterMs?: number;
}

/**
 * Renders the current word being fingerspelled letter-by-letter.
 * Triggered by the parent when the avatar receives a cue for a clip it can't play.
 * Visual-only: the actual hand shapes would be driven by A-Z .glb clips,
 * but this overlay gives deaf/mute users immediate feedback that fallback is engaged.
 */
export function FingerspellOverlay({
  word,
  onDone,
  letterMs = 220,
}: FingerspellOverlayProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!word) {
      setIndex(0);
      return;
    }
    setIndex(0);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      if (i >= word.length) {
        clearInterval(timer);
        setTimeout(() => onDone?.(), letterMs);
        return;
      }
      setIndex(i);
    }, letterMs);
    return () => clearInterval(timer);
  }, [word, letterMs, onDone]);

  return (
    <AnimatePresence>
      {word && (
        <motion.div
          role="status"
          aria-live="polite"
          aria-label={`Fingerspelling ${word}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
        >
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-2xl",
              "bg-zinc-950/85 backdrop-blur-md border border-white/10",
              "shadow-[0_8px_32px_rgba(0,0,0,0.55)]",
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 font-space-grotesk">
              Fingerspell
            </span>
            <div className="flex gap-1">
              {word.split("").map((ch, i) => {
                const active = i === index;
                const past = i < index;
                return (
                  <span
                    key={`${ch}-${i}`}
                    className={cn(
                      "inline-grid place-items-center h-8 w-7 rounded-md text-sm font-bold font-space-grotesk transition-all",
                      active &&
                        "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_4px_14px_rgba(139,92,246,0.55)] scale-110",
                      past && "text-zinc-500",
                      !active && !past && "text-zinc-300",
                    )}
                  >
                    {ch.toUpperCase()}
                  </span>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
