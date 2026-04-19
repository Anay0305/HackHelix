import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center gap-4 py-12 px-6",
        className,
      )}
    >
      <div className="h-14 w-14 rounded-full bg-gradient-brand-soft grid place-items-center text-brand-purple border border-white/10">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {description && (
          <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
