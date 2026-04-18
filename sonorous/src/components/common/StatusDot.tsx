import { cn } from "@/lib/cn";
import type { WsStatus } from "@/api/socket";

const colors: Record<WsStatus, string> = {
  idle: "bg-zinc-600",
  connecting: "bg-amber-400 animate-pulse",
  open: "bg-emerald-400",
  closed: "bg-zinc-500",
  error: "bg-brand-rose",
};

const glows: Record<WsStatus, string> = {
  idle: "",
  connecting: "shadow-[0_0_10px_rgba(251,191,36,0.6)]",
  open: "shadow-[0_0_10px_rgba(52,211,153,0.6)]",
  closed: "",
  error: "shadow-[0_0_10px_rgba(192,81,119,0.7)]",
};

const labels: Record<WsStatus, string> = {
  idle: "Idle",
  connecting: "Connecting",
  open: "Live",
  closed: "Disconnected",
  error: "Error",
};

export function StatusDot({
  status,
  showLabel = true,
  className,
}: {
  status: WsStatus;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={`Connection status: ${labels[status]}`}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("h-2 w-2 rounded-full", colors[status], glows[status])}
      />
      {showLabel && <span className="text-muted">{labels[status]}</span>}
    </span>
  );
}
