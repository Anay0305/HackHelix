interface TopBarProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 glass-subtle border-b border-white/5 px-4 md:px-8 py-3 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        {title && (
          <h1 className="font-space-grotesk text-base md:text-lg font-semibold truncate text-ink">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-xs text-zinc-500 truncate font-inter">{subtitle}</p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}
