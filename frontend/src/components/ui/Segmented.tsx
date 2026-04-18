import { cn } from "@/lib/cn";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  ariaLabel?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex p-1 rounded-lg glass",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            aria-label={opt.ariaLabel ?? opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 focus-ring",
              active
                ? "bg-brand-primary text-white shadow-[0_4px_14px_rgba(139,92,246,0.4)]"
                : "text-zinc-400 hover:text-white",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
