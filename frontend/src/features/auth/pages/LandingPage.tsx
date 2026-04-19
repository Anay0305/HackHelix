import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Radio,
  GraduationCap,
  Landmark,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Pillar {
  icon: LucideIcon;
  label: string;
  to: string;
}

const pillars: Pillar[] = [
  { icon: ShieldCheck, label: "UDID Auth", to: "/login" },
  { icon: Radio, label: "Simulator", to: "/simulator" },
  { icon: GraduationCap, label: "Learn ISL", to: "/learn" },
  { icon: Landmark, label: "Benefits", to: "/benefits" },
];

export function LandingPage() {
  return (
    <div className="bg-zinc-950 pt-8 md:pt-16 font-inter">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-3xl mx-auto"
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 mb-6 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wider uppercase",
            "bg-white/5 backdrop-blur-md border border-white/10 text-zinc-300 font-space-grotesk",
          )}
        >
          <Sparkles className="h-3 w-3 text-[#8B5CF6]" aria-hidden />
          Hack Helix 2026
        </span>

        <h1 className="font-space-grotesk text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] text-ink">
          Translate{" "}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#8B5CF6] to-[#C05177]">
            intent
          </span>
          ,<br className="hidden sm:block" /> not just words.
        </h1>

        <p className="mt-6 text-base md:text-lg text-zinc-400 leading-relaxed max-w-xl mx-auto">
          Bi-directional Indian Sign Language translation with a 3D signing
          avatar, real-time ISL recognition, and a curriculum that teaches the
          rest of us.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/login"
            aria-label="Sign in with UDID"
            className={cn(
              "inline-flex items-center justify-center gap-2 w-full sm:w-auto",
              "h-12 px-6 rounded-full text-sm font-semibold font-space-grotesk",
              "bg-gradient-to-r from-[#8B5CF6] to-[#C05177] text-white border-0",
              "shadow-[0_6px_20px_rgba(139,92,246,0.45)]",
              "transition-all focus-ring",
              "hover:shadow-[0_8px_28px_rgba(192,81,119,0.5)] active:scale-[0.98]",
            )}
          >
            Sign in with UDID
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            to="/simulator"
            aria-label="Open the simulator demo"
            className={cn(
              "inline-flex items-center justify-center gap-2 w-full sm:w-auto",
              "h-12 px-6 rounded-full text-sm font-semibold font-space-grotesk",
              "bg-white/5 backdrop-blur-md border border-white/10 text-ink",
              "hover:bg-white/10 transition-all focus-ring active:scale-[0.98]",
            )}
          >
            Try the simulator
          </Link>
        </div>
      </motion.section>

      {/* Bottom cards — strict glassmorphism per spec */}
      <section
        aria-label="Core features"
        className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto"
      >
        {pillars.map((p, i) => (
          <motion.div
            key={p.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
          >
            <Link
              to={p.to}
              aria-label={p.label}
              className={cn(
                "block p-5 text-center bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl",
                "hover:bg-white/10 transition-all focus-ring active:scale-[0.98]",
              )}
            >
              <div
                className={cn(
                  "mx-auto h-12 w-12 rounded-full grid place-items-center text-white mb-3",
                  "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] shadow-[0_6px_20px_rgba(139,92,246,0.4)]",
                )}
              >
                <p.icon className="h-5 w-5" strokeWidth={2.2} aria-hidden />
              </div>
              <p className="text-sm font-medium font-space-grotesk text-white">
                {p.label}
              </p>
            </Link>
          </motion.div>
        ))}
      </section>

      <footer className="mt-20 text-center text-xs text-zinc-500 pb-8 font-inter">
        Built for the deaf and hard-of-hearing community · WCAG AA · RPWD Act
        2016 compliant
      </footer>
    </div>
  );
}
