import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useDevModeStore } from "@/store/devModeStore";
import { cn } from "@/lib/cn";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
  linkTo?: string;
  className?: string;
}

export function Logo({
  size = "md",
  withWordmark = true,
  linkTo,
  className,
}: LogoProps) {
  const navigate = useNavigate();
  const registerClick = useDevModeStore((s) => s.registerLogoClick);

  const mark = {
    sm: "h-7 w-7 text-[11px]",
    md: "h-8 w-8 text-sm",
    lg: "h-10 w-10 text-base",
  }[size];

  const wordmark = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  }[size];

  function onClick(e: React.MouseEvent) {
    const activated = registerClick();
    if (activated) {
      e.preventDefault();
      toast.success("Developer mode unlocked", {
        description: "Debugger is now in your navigation.",
      });
      navigate("/debug");
      return;
    }
    if (linkTo) {
      e.preventDefault();
      navigate(linkTo);
    }
  }

  return (
    <button
      onClick={onClick}
      aria-label="Sonorous home"
      className={cn(
        "flex items-center gap-2 focus-ring rounded-lg",
        className,
      )}
    >
      <div className="relative">
        <div
          className={cn(
            "rounded-xl bg-brand-primary grid place-items-center text-white font-bold shadow-[0_6px_20px_rgba(139,92,246,0.4)]",
            mark,
          )}
        >
          S
        </div>
        <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand-tertiary ring-2 ring-brand-neutral animate-pulse-soft" />
      </div>
      {withWordmark && (
        <span
          className={cn(
            "font-display font-semibold tracking-tight text-white",
            wordmark,
          )}
        >
          Sonorous
        </span>
      )}
    </button>
  );
}
