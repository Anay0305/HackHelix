import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

interface Props {
  dailyXpLog: Record<string, number>;
  weeks?: number; // default 12
  className?: string;
}

// Color scale: 5 intensity levels keyed to % of target.
function colorFor(xp: number, target = 50) {
  if (xp <= 0) return "rgba(255,255,255,0.05)";
  const ratio = Math.min(1, xp / target);
  if (ratio < 0.25) return "rgba(139,92,246,0.20)";
  if (ratio < 0.5) return "rgba(139,92,246,0.45)";
  if (ratio < 0.8) return "rgba(139,92,246,0.75)";
  if (ratio < 1) return "rgba(236,72,153,0.85)";
  return "rgba(245,158,11,0.95)";
}

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function ActivityHeatmap({ dailyXpLog, weeks = 12, className }: Props) {
  const { grid, max, total, activeDays } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Start grid on the Sunday `weeks` weeks ago
    const dayOfWeek = today.getDay(); // 0=Sun..6=Sat
    const start = new Date(today);
    start.setDate(today.getDate() - (weeks - 1) * 7 - dayOfWeek);

    const cells: { date: Date; key: string; xp: number }[] = [];
    let max = 0;
    let total = 0;
    let activeDays = 0;
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toKey(d);
      const xp = dailyXpLog[key] ?? 0;
      if (d > today) {
        cells.push({ date: d, key, xp: -1 }); // future
      } else {
        cells.push({ date: d, key, xp });
        if (xp > 0) {
          activeDays++;
          total += xp;
          max = Math.max(max, xp);
        }
      }
    }
    return { grid: cells, max, total, activeDays };
  }, [dailyXpLog, weeks]);

  const columns: { date: Date; key: string; xp: number }[][] = [];
  for (let c = 0; c < weeks; c++) {
    columns.push(grid.slice(c * 7, c * 7 + 7));
  }

  const monthLabels = useMemo(() => {
    return columns.map((col, idx) => {
      const first = col[0]?.date;
      if (!first) return "";
      const day = first.getDate();
      // Show month label on the column where the month begins (day <= 7)
      if (day <= 7 || idx === 0) {
        return first.toLocaleString("en", { month: "short" });
      }
      return "";
    });
  }, [columns]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted uppercase tracking-wider text-[10px] font-semibold">
          Activity · last {weeks} weeks
        </span>
        <span className="text-muted text-[11px]">
          <span className="text-white font-semibold">{activeDays}</span> active
          days · <span className="text-white font-semibold">{total}</span> XP
        </span>
      </div>

      <div className="glass rounded-xl2 p-3 overflow-x-auto">
        {/* Month labels row */}
        <div
          className="grid gap-1 mb-1 text-[9px] text-muted/80 uppercase tracking-wider"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(10px, 1fr))` }}
        >
          {monthLabels.map((m, i) => (
            <div key={i} className="text-left">
              {m}
            </div>
          ))}
        </div>

        <div className="flex gap-1">
          {/* Day-of-week labels */}
          <div className="flex flex-col gap-1 text-[9px] text-muted/60 pr-1 pt-[2px]">
            {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
              <span key={i} style={{ height: 10, lineHeight: "10px" }}>
                {d}
              </span>
            ))}
          </div>

          <div
            className="grid gap-1 flex-1"
            style={{
              gridTemplateColumns: `repeat(${weeks}, minmax(10px, 1fr))`,
              gridAutoFlow: "column",
              gridTemplateRows: "repeat(7, 10px)",
            }}
          >
            {grid.map((cell, i) => {
              const isFuture = cell.xp < 0;
              return (
                <motion.div
                  key={cell.key}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: Math.min(0.6, i * 0.002),
                    duration: 0.3,
                  }}
                  className="rounded-sm"
                  style={{
                    width: "100%",
                    height: 10,
                    background: isFuture
                      ? "transparent"
                      : colorFor(cell.xp, 50),
                    outline: isFuture ? "1px dashed rgba(255,255,255,0.05)" : "none",
                    outlineOffset: "-1px",
                  }}
                  title={
                    isFuture
                      ? cell.key
                      : cell.xp > 0
                        ? `${cell.key}: ${cell.xp} XP`
                        : `${cell.key}: rest day`
                  }
                />
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2 text-[9px] text-muted/70">
          <span>less</span>
          <span
            className="rounded-sm"
            style={{ width: 10, height: 10, background: colorFor(0) }}
          />
          <span
            className="rounded-sm"
            style={{ width: 10, height: 10, background: colorFor(10) }}
          />
          <span
            className="rounded-sm"
            style={{ width: 10, height: 10, background: colorFor(25) }}
          />
          <span
            className="rounded-sm"
            style={{ width: 10, height: 10, background: colorFor(40) }}
          />
          <span
            className="rounded-sm"
            style={{ width: 10, height: 10, background: colorFor(50) }}
          />
          <span>more</span>
          {max > 0 && (
            <span className="ml-auto text-muted/60">best day · {max} XP</span>
          )}
        </div>
      </div>
    </div>
  );
}
