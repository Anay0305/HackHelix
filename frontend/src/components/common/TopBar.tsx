import { Search } from "lucide-react";
import { useLearningStore } from "@/store";
import { Badge } from "@/components/ui/Badge";

interface TopBarProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  const xp = useLearningStore((s) => s.xp);
  const streak = useLearningStore((s) => s.streakDays);

  return (
    <header className="sticky top-0 z-20 glass-subtle border-b border-white/5 px-4 md:px-8 py-3 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        {title && (
          <h1 className="font-display text-base md:text-lg font-semibold truncate text-ink">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-xs text-muted truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden md:flex items-center gap-2">
          <Badge
            variant="warning"
            aria-label={`Streak: ${streak} days`}
            title={`${streak}-day streak`}
          >
            🔥 {streak}d
          </Badge>
          <Badge
            variant="info"
            aria-label={`Experience points: ${xp}`}
            title={`${xp} XP`}
          >
            ⚡ {xp} XP
          </Badge>
        </div>

        <button
          aria-label="Search"
          className="hidden md:inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-white/5 focus-ring"
        >
          <Search className="h-4 w-4" />
        </button>
        {actions}
      </div>
    </header>
  );
}
