import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Radio,
  GraduationCap,
  Landmark,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const pillars: Array<{
  icon: typeof ShieldCheck;
  label: string;
  tone: "purple" | "rose";
}> = [
  { icon: ShieldCheck, label: "UDID Auth", tone: "purple" },
  { icon: Radio, label: "Simulator", tone: "rose" },
  { icon: GraduationCap, label: "Learn ISL", tone: "purple" },
  { icon: Landmark, label: "Benefits", tone: "rose" },
];

export function LandingPage() {
  return (
    <div className="pt-8 md:pt-16">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-3xl mx-auto"
      >
        <Badge variant="brand" className="mb-6 py-1.5 px-3">
          <Sparkles className="h-3 w-3" aria-hidden />
          Hack Helix 2026
        </Badge>
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Translate{" "}
          <span className="gradient-text">intent</span>,
          <br className="hidden sm:block" /> not just words.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted leading-relaxed max-w-xl mx-auto">
          Bi-directional Indian Sign Language translation with a 3D signing avatar,
          real-time ISL recognition, and a curriculum that teaches the rest of us.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/login" aria-label="Sign in with UDID">
            <Button size="lg" className="w-full sm:w-auto">
              Sign in with UDID
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </Link>
          <Link to="/simulator" aria-label="Open the simulator demo">
            <Button variant="secondary" size="lg" className="w-full sm:w-auto">
              Try the simulator
            </Button>
          </Link>
        </div>
      </motion.section>

      {/* Icon pillars — no text-heavy descriptions */}
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
            className="glass rounded-2xl p-5 text-center hover:border-brand-primary/30 transition-colors"
          >
            <div
              className={cn(
                "mx-auto h-12 w-12 rounded-full grid place-items-center text-white mb-3 shadow-lg",
                p.tone === "purple"
                  ? "bg-brand-primary shadow-[0_6px_20px_rgba(139,92,246,0.4)]"
                  : "bg-brand-tertiary shadow-[0_6px_20px_rgba(192,81,119,0.4)]",
              )}
            >
              <p.icon className="h-5 w-5" aria-hidden />
            </div>
            <p className="text-sm font-medium text-white">{p.label}</p>
          </motion.div>
        ))}
      </section>

      <footer className="mt-20 text-center text-xs text-muted pb-8">
        Built for the deaf and hard-of-hearing community · WCAG AA ·
        RPWD Act 2016 compliant
      </footer>
    </div>
  );
}
