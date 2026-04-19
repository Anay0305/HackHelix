import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ear,
  EarOff,
  VolumeX,
  Volume2,
  Trash2,
  ShieldAlert,
  Clock,
} from "lucide-react";
import { TopBar } from "@/components/common/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/common/StatusDot";
import type { WsStatus } from "@/api/socket";
import { useSoundMonitorStore, type AlertType, type SoundAlert } from "@/store";
import {
  useSoundMonitor,
  humanLabel,
  iconFor,
  severityFor,
} from "../hooks/useSoundMonitor";
import { VibrationEditor } from "../components/VibrationEditor";
import { cn } from "@/lib/cn";

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

export function SoundMonitorPage() {
  const { isLive, start, stop } = useSoundMonitor();
  const wsStatus = useSoundMonitorStore((s) => s.wsStatus);
  const alerts = useSoundMonitorStore((s) => s.alerts);
  const latest = useSoundMonitorStore((s) => s.latest);
  const muted = useSoundMonitorStore((s) => s.muted);
  const toggleMute = useSoundMonitorStore((s) => s.toggleMute);
  const clearAlerts = useSoundMonitorStore((s) => s.clearAlerts);
  const bufferedMs = useSoundMonitorStore((s) => s.bufferedMs);

  const latestIsFresh = useMemo(() => {
    if (!latest) return false;
    return Date.now() - latest.timestampMs < 10_000;
  }, [latest]);

  return (
    <div className="relative">
      <TopBar
        title="Sound Monitor"
        subtitle="Listens to your environment and flags sounds you can't hear."
      />

      <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto space-y-6">
        {/* Hero — on/off + status */}
        <HeroCard
          isLive={isLive}
          wsStatus={wsStatus}
          bufferedMs={bufferedMs}
          onStart={start}
          onStop={stop}
        />

        {/* Latest alert — big, impossible-to-miss */}
        <AnimatePresence>
          {latestIsFresh && latest && (
            <motion.div
              key={latest.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
            >
              <LatestAlertCard alert={latest} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mute toggles */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-purple">
                Alerts to listen for
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAlerts}
                aria-label="Clear history"
                className="gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Clear history
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_TYPES.map((t) => {
                const isMuted = muted[t];
                return (
                  <button
                    key={t}
                    onClick={() => toggleMute(t)}
                    aria-pressed={!isMuted}
                    aria-label={`${humanLabel(t)} ${isMuted ? "muted" : "on"}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition",
                      isMuted
                        ? "bg-zinc-900/60 border-white/5 text-zinc-500"
                        : "bg-white/5 border-white/10 text-ink hover:border-brand-purple/50",
                    )}
                  >
                    <span aria-hidden>{iconFor(t)}</span>
                    <span>{humanLabel(t)}</span>
                    {isMuted ? (
                      <VolumeX className="h-3 w-3" aria-hidden />
                    ) : (
                      <Volume2 className="h-3 w-3" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Vibration settings */}
        <VibrationEditor />

        {/* History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-2xl font-semibold">Today</h2>
            <Badge variant="muted" className="font-inter">
              {alerts.length} {alerts.length === 1 ? "alert" : "alerts"}
            </Badge>
          </div>
          {alerts.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center text-muted">
                {isLive
                  ? "No alerts yet — listening in the background."
                  : "Start monitoring to hear what's happening around you."}
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <HistoryRow key={a.id} alert={a} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

function HeroCard({
  isLive,
  wsStatus,
  bufferedMs,
  onStart,
  onStop,
}: {
  isLive: boolean;
  wsStatus: WsStatus;
  bufferedMs: number;
  onStart: () => void;
  onStop: () => void;
}) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setPulse((p) => p + 1), 800);
    return () => clearInterval(id);
  }, [isLive]);

  return (
    <Card>
      <CardContent className="pt-6 pb-6 flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="relative">
          <div
            className={cn(
              "h-16 w-16 rounded-full grid place-items-center transition-all",
              isLive
                ? "bg-gradient-to-br from-emerald-400 to-brand-primary text-white shadow-[0_0_40px_rgba(139,92,246,0.5)]"
                : "bg-zinc-800 text-zinc-500",
            )}
          >
            {isLive ? (
              <Ear className="h-7 w-7" aria-hidden />
            ) : (
              <EarOff className="h-7 w-7" aria-hidden />
            )}
          </div>
          {isLive && (
            <motion.span
              key={pulse}
              className="absolute inset-0 rounded-full border-2 border-brand-purple/70"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              aria-hidden
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold">
              {isLive ? "Listening" : "Off"}
            </h2>
            {isLive && <StatusDot status={wsStatus} />}
          </div>
          <p className="text-sm text-muted mt-1">
            {isLive
              ? `Buffered ${(bufferedMs / 1000).toFixed(1)} s · YAMNet analyses in the background.`
              : "We'll only access your microphone when you turn this on."}
          </p>
        </div>
        {isLive ? (
          <Button variant="secondary" onClick={onStop} aria-label="Stop monitoring">
            Stop
          </Button>
        ) : (
          <Button onClick={onStart} aria-label="Start monitoring" className="gap-2">
            <Ear className="h-4 w-4" aria-hidden />
            Start Listening
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function LatestAlertCard({ alert }: { alert: SoundAlert }) {
  const sev = severityFor(alert.alertType);
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "relative overflow-hidden rounded-xl2 p-6 md:p-7 border-2",
        sev === "critical"
          ? "border-rose-500/50 bg-gradient-to-br from-rose-500/20 via-rose-500/10 to-transparent"
          : sev === "warn"
            ? "border-amber-500/50 bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent"
            : "border-brand-purple/50 bg-gradient-to-br from-brand-purple/20 via-brand-purple/10 to-transparent",
      )}
    >
      {/* Flashing edge */}
      <motion.div
        aria-hidden
        className={cn(
          "absolute inset-0 pointer-events-none",
          sev === "critical" ? "bg-rose-500/20" : sev === "warn" ? "bg-amber-500/15" : "bg-brand-purple/15",
        )}
        animate={{ opacity: [0, 0.8, 0] }}
        transition={{ duration: 1.2, repeat: 4 }}
      />
      <div className="relative flex items-center gap-5">
        <div
          className={cn(
            "h-20 w-20 rounded-2xl grid place-items-center text-5xl shadow-lg",
            sev === "critical"
              ? "bg-rose-500/90 text-white"
              : sev === "warn"
                ? "bg-amber-500/90 text-white"
                : "bg-brand-purple text-white",
          )}
        >
          <span aria-hidden>{iconFor(alert.alertType)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert
              className={cn(
                "h-4 w-4",
                sev === "critical"
                  ? "text-rose-400"
                  : sev === "warn"
                    ? "text-amber-400"
                    : "text-brand-purple",
              )}
              aria-hidden
            />
            <span className="text-[11px] uppercase tracking-wider font-semibold">
              {sev === "critical"
                ? "Critical alert"
                : sev === "warn"
                  ? "Attention"
                  : "Sound detected"}
            </span>
          </div>
          <p className="font-display text-3xl md:text-4xl font-semibold mt-1">
            {humanLabel(alert.alertType)}
          </p>
          <p className="text-sm text-muted mt-1">
            {alert.label} · {Math.round(alert.confidence * 100)}% confidence
          </p>
        </div>
        <Badge variant="muted" className="shrink-0 hidden md:inline-flex">
          <Clock className="h-3 w-3" aria-hidden />
          just now
        </Badge>
      </div>
    </div>
  );
}

function HistoryRow({ alert }: { alert: SoundAlert }) {
  const sev = severityFor(alert.alertType);
  const when = new Date(alert.timestampMs);
  return (
    <li>
      <Card>
        <CardContent className="py-3 flex items-center gap-4">
          <div
            className={cn(
              "h-11 w-11 rounded-full grid place-items-center text-xl shrink-0",
              sev === "critical"
                ? "bg-rose-500/20 text-rose-400"
                : sev === "warn"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-brand-purple/20 text-brand-purple",
            )}
          >
            <span aria-hidden>{iconFor(alert.alertType)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">
              {humanLabel(alert.alertType)}
            </p>
            <p className="text-xs text-muted truncate">{alert.label}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-mono text-muted">
              {when.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-[11px] gradient-text font-semibold">
              {Math.round(alert.confidence * 100)}%
            </p>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
