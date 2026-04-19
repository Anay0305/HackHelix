import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-neutral",
  {
    variants: {
      variant: {
        // Primary — filled purple (per mockup)
        primary:
          "bg-brand-primary text-white hover:bg-brand-secondary shadow-[0_8px_24px_rgba(139,92,246,0.35)] hover:shadow-[0_12px_32px_rgba(139,92,246,0.5)] active:scale-[0.98]",
        // Secondary — inverted (white fill, dark text) per mockup
        secondary:
          "bg-white text-brand-neutral hover:bg-zinc-200 active:scale-[0.98]",
        // Outlined — transparent with purple border (per mockup)
        outline:
          "bg-transparent text-brand-primary border border-brand-primary hover:bg-brand-primary/10 active:scale-[0.98]",
        // Ghost — subtle hover only
        ghost: "text-zinc-300 hover:bg-white/5 hover:text-white",
        // Accent / rose — filled tertiary (the "Label" style from mockup)
        accent:
          "bg-brand-tertiary text-white hover:brightness-110 active:scale-[0.98] shadow-[0_8px_24px_rgba(192,81,119,0.35)]",
        // Destructive
        danger:
          "bg-brand-tertiary text-white hover:brightness-110 active:scale-[0.98]",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-11 w-11 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
