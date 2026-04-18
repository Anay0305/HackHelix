import { useEffect, useRef, useState } from "react";
import { Trash2, Copy, Activity, Gauge, Code2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/common/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatLatency, formatTime } from "@/lib/format";
import { useDebuggerStore } from "@/store";

type Pane = "logs" | "payload" | "metrics";

export function DebuggerPage() {
  const [pane, setPane] = useState<Pane>("logs");

  return (
    <div>
      <TopBar
        title="Developer Debugger"
        subtitle="Live telemetry from the simulator pipeline. For judges & engineers."
      />

      <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto">
        {/* Top metrics strip */}
        <MetricsStrip />

        {/* Tabs */}
        <div className="mt-6 flex gap-1 p-1 rounded-lg glass w-fit" role="tablist">
          {(
            [
              { id: "logs", label: "Logs", icon: Activity },
              { id: "payload", label: "Payloads", icon: Code2 },
              { id: "metrics", label: "Metrics", icon: Gauge },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setPane(t.id as Pane)}
              role="tab"
              aria-selected={pane === t.id}
              aria-label={t.label}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all focus-ring",
                pane === t.id
                  ? "bg-gradient-brand text-white shadow-glow-brand"
                  : "text-muted hover:text-ink",
              )}
            >
              <t.icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="mt-4">
          {pane === "logs" && <LogTerminal />}
          {pane === "payload" && <PayloadInspector />}
          {pane === "metrics" && <MetricsPane />}
        </div>
      </div>
    </div>
  );
}

function MetricsStrip() {
  const latency = useDebuggerStore(
    (s) => s.latencyHistory[s.latencyHistory.length - 1]?.v ?? 0,
  );
  const confidence = useDebuggerStore(
    (s) => s.confidenceHistory[s.confidenceHistory.length - 1]?.v ?? 0,
  );
  const errors = useDebuggerStore(
    (s) => s.logs.filter((l) => l.level === "error").length,
  );
  const total = useDebuggerStore((s) => s.logs.length);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard
        icon={Gauge}
        label="Last latency"
        value={formatLatency(latency)}
        tone={latency > 500 ? "danger" : latency > 200 ? "warning" : "success"}
      />
      <MetricCard
        icon={Activity}
        label="Last confidence"
        value={`${Math.round(confidence * 100)}%`}
        tone={confidence < 0.7 ? "warning" : "success"}
      />
      <MetricCard
        icon={Code2}
        label="Total events"
        value={String(total)}
        tone="info"
      />
      <MetricCard
        icon={Activity}
        label="Errors"
        value={String(errors)}
        tone={errors > 0 ? "danger" : "success"}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const bg = {
    success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    danger: "bg-brand-rose/15 text-brand-rose border-brand-rose/30",
    info: "bg-brand-purple/15 text-brand-purple border-brand-purple/30",
  }[tone];

  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <div className={cn("h-9 w-9 rounded-lg grid place-items-center border", bg)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] text-muted uppercase tracking-wider">
            {label}
          </p>
          <p className="text-lg font-semibold mt-0.5 font-mono">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LogTerminal() {
  const logs = useDebuggerStore((s) => s.logs);
  const clearLogs = useDebuggerStore((s) => s.clearLogs);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">("all");

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, autoScroll]);

  const filtered = filter === "all" ? logs : logs.filter((l) => l.level === filter);

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            <span className="h-3 w-3 rounded-full bg-rose-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>
          <span className="ml-3 text-xs font-mono text-muted">
            sonorous@simulator:~ ws://{window.location.host}/ws/simulator
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            aria-label="Filter log level"
            className="text-xs font-mono bg-white/5 border border-white/10 text-ink rounded-md px-2 py-1 focus-ring"
          >
            <option value="all">all</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoScroll((s) => !s)}
            aria-label={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
          >
            {autoScroll ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearLogs}>
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="h-[520px] overflow-y-auto scrollbar-thin font-mono text-xs bg-black/60 text-zinc-100 p-4 space-y-0.5 rounded-b-xl2"
        role="log"
        aria-live="polite"
        aria-label="Debug log stream"
        onWheel={() => setAutoScroll(false)}
      >
        {filtered.length === 0 ? (
          <div className="text-zinc-500 italic">
            Waiting for events\u2026 Start the simulator to stream logs.
          </div>
        ) : (
          filtered.map((log) => (
            <div key={log.id} className="flex gap-3 leading-relaxed">
              <span className="text-zinc-500 shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span
                className={cn(
                  "shrink-0 w-12 uppercase font-semibold terminal-glow",
                  log.level === "error" && "text-rose-400",
                  log.level === "warn" && "text-amber-400",
                  log.level === "info" && "text-emerald-400",
                )}
              >
                {log.level}
              </span>
              <span className="flex-1">
                {log.msg}
                {log.latencyMs !== undefined && (
                  <span className="text-zinc-400 ml-2">
                    [{formatLatency(log.latencyMs)}]
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function PayloadInspector() {
  const payload = useDebuggerStore((s) => s.lastPayload);

  function copy() {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toast.success("Copied payload to clipboard");
  }

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Last WebSocket payload
          </p>
          {payload != null && (
            <p className="text-sm font-mono mt-0.5">
              type: <span className="gradient-text font-semibold">{(payload as any)?.type}</span>
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={copy} disabled={!payload}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
      </div>
      <CardContent className="pt-4 pb-4">
        {payload == null ? (
          <p className="text-muted italic text-sm">
            No payload yet. Open the simulator and start a session.
          </p>
        ) : (
          <pre className="text-xs font-mono bg-black/60 text-ink border border-white/10 rounded-lg p-4 overflow-auto scrollbar-thin max-h-[440px]">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function MetricsPane() {
  const latencyHistory = useDebuggerStore((s) => s.latencyHistory);
  const confidenceHistory = useDebuggerStore((s) => s.confidenceHistory);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Latency (last 60s)</h3>
            <Badge variant="muted" className="font-mono">
              p50/p95/p99
            </Badge>
          </div>
          <Sparkline
            data={latencyHistory.map((p) => p.v)}
            max={Math.max(500, ...latencyHistory.map((p) => p.v))}
            color="#8B5CF6"
            unit="ms"
          />
          <Stats data={latencyHistory.map((p) => p.v)} unit="ms" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">NLP Confidence</h3>
            <Badge variant="muted" className="font-mono">
              gauge
            </Badge>
          </div>
          <ConfidenceGauge
            value={
              confidenceHistory[confidenceHistory.length - 1]?.v ?? 0
            }
          />
          <div className="mt-3">
            <Sparkline
              data={confidenceHistory.map((p) => p.v)}
              max={1}
              color="#10B981"
              unit=""
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Sparkline({
  data,
  max,
  color,
  unit,
}: {
  data: number[];
  max: number;
  color: string;
  unit: string;
}) {
  if (data.length === 0) {
    return (
      <div className="h-24 rounded-lg glass grid place-items-center">
        <span className="text-xs text-muted italic">No data yet</span>
      </div>
    );
  }
  const w = 400;
  const h = 96;
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * w;
      const y = h - (Math.min(v, max) / max) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24">
      <defs>
        <linearGradient id={`grad-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points={`0,${h} ${points} ${w},${h}`}
        fill={`url(#grad-${color.slice(1)})`}
      />
      <text x="6" y="14" className="text-[10px] fill-slate-500" style={{ fontFamily: "JetBrains Mono" }}>
        max {max}
        {unit}
      </text>
    </svg>
  );
}

function Stats({ data, unit }: { data: number[]; unit: string }) {
  if (data.length === 0) return null;
  const sorted = [...data].sort((a, b) => a - b);
  const p = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return (
    <div className="grid grid-cols-3 gap-2 mt-3 text-xs font-mono">
      <Stat label="p50" value={`${Math.round(p(0.5))}${unit}`} />
      <Stat label="p95" value={`${Math.round(p(0.95))}${unit}`} />
      <Stat label="p99" value={`${Math.round(p(0.99))}${unit}`} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md glass px-2 py-1.5 text-center">
      <div className="text-[10px] text-muted uppercase">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  );
}

function ConfidenceGauge({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const r = 56;
  const c = 2 * Math.PI * r;
  const color =
    pct >= 0.85 ? "#10B981" : pct >= 0.7 ? "#8B5CF6" : "#F59E0B";
  return (
    <div className="flex items-center justify-center relative h-40">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dashoffset 0.3s ease, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-2xl font-bold">{Math.round(pct * 100)}%</div>
          <div className="text-[10px] text-muted uppercase">confidence</div>
        </div>
      </div>
    </div>
  );
}
