import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { formatUdid } from "@/lib/format";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export const UdidInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, error, className, ...rest }, ref) => {
    return (
      <div>
        <label
          htmlFor="udid-input"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2 block"
        >
          Unique Disability ID
        </label>
        <input
          id="udid-input"
          ref={ref}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={formatUdid(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder="MH-0002-4817-2301"
          maxLength={17}
          className={cn(
            "w-full h-14 rounded-xl border bg-white/5 px-4 text-lg font-mono tracking-[0.15em] text-center text-ink",
            "focus:outline-none focus:bg-white/10 transition-all",
            error
              ? "border-brand-rose/50 focus:border-brand-rose focus:shadow-[0_0_0_4px_rgba(192,81,119,0.2)]"
              : "border-white/10 focus:border-brand-purple focus:shadow-[0_0_0_4px_rgba(139,92,246,0.2)]",
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? "udid-error" : undefined}
          {...rest}
        />
        {error && (
          <p id="udid-error" role="alert" className="text-xs text-brand-rose mt-2">
            {error}
          </p>
        )}
      </div>
    );
  },
);
UdidInput.displayName = "UdidInput";
