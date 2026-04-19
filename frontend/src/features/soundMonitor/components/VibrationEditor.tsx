import { useMemo, useState } from "react";
import { Play, RotateCcw, Settings2 } from "lucide-react";
import { useSoundMonitorStore, type AlertType } from "@/store";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { humanLabel, iconFor } from "../hooks/useSoundMonitor";

const ALL_TYPES: AlertType[] = [
  "fire_alarm",
  "siren",
  "horn",
  "doorbell",
  "alarm",
  "phone",
  "bell",
  "baby_cry",
];

// Preset library — keep labels short so the chip row doesn't wrap on mobile
const PRESETS: { label: string; pattern: number[] }[] = [
  { label: "Off",     pattern: [] },
  { label: "Short",   pattern: [150] },
  { label: "Double",  pattern: [150, 80, 150] },
  { label: "Triple",  pattern: [120, 60, 120, 60, 120] },
  { label: "Long",    pattern: [600] },
  { label: "Ding-dong", pattern: [180, 100, 180] },
  { label: "SOS",     pattern: [100, 100, 100, 100, 100, 300, 300, 100, 300, 100, 300, 300, 100, 100, 100, 100, 100] },
  { label: "Urgent",  pattern: [400, 100, 400, 100, 400] },
];

function formatPattern(p: number[]): string {
  return p.join(", ");
}

function parsePattern(raw: string): number[] | null {
  if (!raw.trim()) return [];
  const parts = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s));
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 10_000)) return null;
  if (parts.length > 40) return null;
  return parts.map((n) => Math.round(n));
}

export function VibrationEditor() {
  const vibration    = useSoundMonitorStore((s) => s.vibration);
  const setVibration = useSoundMonitorStore((s) => s.setVibration);
  const reset        = useSoundMonitorStore((s) => s.resetVibration);
  const test         = useSoundMonitorStore((s) => s.testVibration);

  const [openType, setOpenType] = useState<AlertType | null>(null);
  const supportsVibration =
    typeof navigator !== "undefined" && "vibrate" in navigator;

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="h-4 w-4 text-brand-purple" aria-hidden />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-purple">
            Vibration patterns
          </p>
        </div>
        <p className="text-xs text-muted mb-3">
          {supportsVibration
            ? "Tap an alert to pick a preset or type your own pattern in milliseconds."
            : "Your browser doesn't support vibration. Patterns are still saved and will play on supported devices."}
        </p>

        <ul className="divide-y divide-white/5">
          {ALL_TYPES.map((t) => {
            const pattern = vibration[t] ?? [];
            const isOpen = openType === t;
            return (
              <li key={t} className="py-2">
                <button
                  onClick={() => setOpenType(isOpen ? null : t)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 text-left focus-ring rounded-lg p-2 -m-2 hover:bg-white/5"
                >
                  <span className="text-xl" aria-hidden>{iconFor(t)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{humanLabel(t)}</p>
                    <p className="text-[11px] text-muted font-mono truncate">
                      {pattern.length === 0
                        ? "no vibration"
                        : `[${formatPattern(pattern)}] ms`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-zinc-500 text-xs transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  >
                    ▾
                  </span>
                </button>

                {isOpen && (
                  <PatternPanel
                    type={t}
                    pattern={pattern}
                    onChange={(p) => setVibration(t, p)}
                    onTest={() => test(t)}
                    onReset={() => reset(t)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function PatternPanel({
  type,
  pattern,
  onChange,
  onTest,
  onReset,
}: {
  type: AlertType;
  pattern: number[];
  onChange: (p: number[]) => void;
  onTest: () => void;
  onReset: () => void;
}) {
  const [raw, setRaw] = useState(formatPattern(pattern));
  const [err, setErr] = useState<string | null>(null);

  // Keep local text in sync if store changes externally
  const serialized = useMemo(() => formatPattern(pattern), [pattern]);
  if (serialized !== raw && err === null) {
    // benign; silent sync
  }

  function apply(input: string) {
    setRaw(input);
    const parsed = parsePattern(input);
    if (parsed === null) {
      setErr("Use numbers 0–10000, comma-separated (max 40 values)");
      return;
    }
    setErr(null);
    onChange(parsed);
  }

  function pickPreset(p: number[]) {
    const s = formatPattern(p);
    setRaw(s);
    setErr(null);
    onChange(p);
  }

  return (
    <div className="mt-3 ml-8 space-y-3" aria-label={`${humanLabel(type)} vibration settings`}>
      {/* Preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = formatPattern(p.pattern) === formatPattern(pattern);
          return (
            <button
              key={p.label}
              onClick={() => pickPreset(p.pattern)}
              aria-pressed={active}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs border transition",
                active
                  ? "bg-brand-purple/20 border-brand-purple/60 text-ink"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:text-ink hover:border-white/20",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Raw editor */}
      <label className="block">
        <span className="text-[11px] uppercase tracking-wider text-muted">
          Custom (ms)
        </span>
        <input
          type="text"
          value={raw}
          onChange={(e) => apply(e.target.value)}
          placeholder="200, 80, 200"
          inputMode="numeric"
          className={cn(
            "mt-1 w-full rounded-lg bg-zinc-950/60 border px-3 py-2 font-mono text-sm",
            err
              ? "border-rose-500/60 focus:border-rose-500"
              : "border-white/10 focus:border-brand-purple/60",
            "focus:outline-none focus:ring-2 focus:ring-brand-purple/25",
          )}
        />
        {err && (
          <p role="alert" className="mt-1 text-[11px] text-rose-400">
            {err}
          </p>
        )}
      </label>

      {/* Visual timeline */}
      {pattern.length > 0 && (
        <div
          aria-hidden
          className="flex items-center gap-0.5 h-5 rounded bg-zinc-950/60 px-2"
        >
          {pattern.map((ms, i) => {
            const isBuzz = i % 2 === 0;
            const w = Math.max(2, Math.min(80, ms / 10));
            return (
              <span
                key={i}
                style={{ width: `${w}px` }}
                className={cn(
                  "h-3 rounded-sm",
                  isBuzz
                    ? "bg-gradient-to-r from-brand-purple to-brand-rose"
                    : "bg-transparent",
                )}
                title={`${isBuzz ? "buzz" : "pause"} ${ms} ms`}
              />
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onTest}
          disabled={pattern.length === 0}
          aria-label={`Test ${humanLabel(type)} vibration`}
          className="gap-1.5"
        >
          <Play className="h-3.5 w-3.5" aria-hidden />
          Test
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          aria-label={`Reset ${humanLabel(type)} vibration to default`}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Default
        </Button>
      </div>
    </div>
  );
}
