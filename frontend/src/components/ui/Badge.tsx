import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeStyles = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default:
          "bg-brand-purple/15 text-brand-purple border border-brand-purple/30",
        muted: "bg-white/5 text-muted border border-white/10",
        success:
          "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30",
        warning:
          "bg-amber-500/10 text-amber-300 border border-amber-500/30",
        danger:
          "bg-brand-rose/15 text-brand-rose border border-brand-rose/30",
        info: "bg-sky-500/10 text-sky-300 border border-sky-500/30",
        brand:
          "bg-gradient-brand-soft text-ink border border-brand-purple/40",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeStyles> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeStyles({ variant }), className)} {...props} />
  );
}
