import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { motion } from "framer-motion";
import { useLearningStore } from "@/store";
import { cn } from "@/lib/cn";

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function HeartsBar({ compact = false }: { compact?: boolean }) {
  const hearts = useLearningStore((s) => s.hearts);
  const maxHearts = useLearningStore((s) => s.maxHearts);
  const refillAt = useLearningStore((s) => s.heartRefillAt);
  const regenHearts = useLearningStore((s) => s.regenHearts);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (hearts >= maxHearts) return;
    const id = setInterval(() => {
      regenHearts();
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [hearts, maxHearts, regenHearts]);

  const remaining = refillAt ? refillAt - Date.now() : 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5",
        compact ? "text-xs" : "text-sm",
      )}
      aria-label={`Hearts: ${hearts} of ${maxHearts}`}
    >
      <div className="flex items-center gap-0.5">
        {Array.from({ length: maxHearts }).map((_, i) => (
          <motion.span
            key={i}
            initial={false}
            animate={{ scale: i < hearts ? 1 : 0.85 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
          >
            <Heart
              className={cn(
                compact ? "h-3.5 w-3.5" : "h-4 w-4",
                i < hearts
                  ? "fill-rose-500 text-rose-500"
                  : "text-zinc-700",
              )}
              strokeWidth={2.2}
              aria-hidden
            />
          </motion.span>
        ))}
      </div>
      {hearts < maxHearts && remaining > 0 && (
        <span className="font-mono text-[11px] text-zinc-400">
          +1 in {formatCountdown(remaining)}
        </span>
      )}
    </div>
  );
}
