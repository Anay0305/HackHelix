import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

interface Props {
  value: number; // 0 - 1
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}

export function ProgressRing({
  value,
  size = 68,
  strokeWidth = 6,
  label,
  sublabel,
  className,
}: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const complete = clamped >= 1;

  return (
    <div className={cn("relative inline-flex", className)} style={{ width: size, height: size }}>
      <motion.svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        animate={
          complete
            ? { scale: [1, 1.06, 1], filter: ["drop-shadow(0 0 0 rgba(16,185,129,0))", "drop-shadow(0 0 12px rgba(16,185,129,0.55))", "drop-shadow(0 0 0 rgba(16,185,129,0))"] }
            : undefined
        }
        transition={{ duration: 1.6, repeat: complete ? Infinity : 0, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="progress-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="50%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#progress-ring-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </motion.svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label && (
          <span className="text-sm font-display font-semibold leading-none text-white">
            {label}
          </span>
        )}
        {sublabel && (
          <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
