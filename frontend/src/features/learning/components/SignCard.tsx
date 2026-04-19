import { motion } from "framer-motion";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SignEntry } from "../data/signCatalog";

interface Props {
  sign: SignEntry;
  index: number;
  isPlaying: boolean;
  onToggle: (sign: SignEntry) => void;
}

export function SignCard({ sign, index, isPlaying, onToggle }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.018, 0.4), duration: 0.3 }}
      className={cn(
        "group relative glass rounded-xl2 overflow-hidden border transition-all cursor-pointer select-none",
        isPlaying
          ? "border-brand-purple/60 shadow-glow-brand bg-brand-primary/5"
          : "border-white/8 hover:border-white/25 hover:bg-white/3",
      )}
      onClick={() => onToggle(sign)}
    >
      {/* Category chip */}
      <div className="px-3 pt-3">
        <span className="inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-purple border border-brand-purple/20">
          {sign.category}
        </span>
      </div>

      {/* Sign name + description */}
      <div className="px-3 pt-2 pb-3">
        <p className="font-display font-semibold text-base leading-tight text-ink">
          {sign.label}
        </p>
        <p className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed">
          {sign.description}
        </p>
      </div>

      {/* Play indicator row */}
      <div className="px-3 pb-3 flex items-center justify-between">
        <div
          className={cn(
            "h-8 w-8 rounded-full grid place-items-center transition-all",
            isPlaying
              ? "bg-brand-primary text-white shadow-glow-brand"
              : "bg-white/10 text-muted group-hover:bg-brand-primary/20 group-hover:text-brand-purple",
          )}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5 ml-0.5" aria-hidden />
          )}
        </div>

        {isPlaying && (
          <div className="flex gap-0.5 items-end h-4">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1 rounded-full bg-brand-purple"
                animate={{ height: [5, 13, 5] }}
                transition={{ duration: 0.75, delay: i * 0.15, repeat: Infinity }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
