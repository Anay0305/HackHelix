import { cn } from "@/lib/cn";

interface ProgressProps {
  value: number; // 0..1
  className?: string;
  color?: "brand" | "emerald" | "amber" | "rose";
}

export function Progress({ value, className, color = "brand" }: ProgressProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const bar = {
    brand: "bg-brand-primary",
    emerald: "bg-emerald-500",
    amber: "bg-amber-400",
    rose: "bg-brand-tertiary",
  }[color];

  return (
    <div
      className={cn(
        "h-2 w-full rounded-full overflow-hidden bg-white/5 border border-white/5",
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(bar, "h-full transition-[width] duration-500 ease-out")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
