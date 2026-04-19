import { useEffect, useRef, useState } from "react";
import { Trash2, Copy, Activity, Gauge, Code2, Pause, Play, Camera, CameraOff } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/common/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatLatency, formatTime } from "@/lib/format";
import { useDebuggerStore } from "@/store";
import { env } from "@/lib/env";

type Pane = "logs" | "payload" | "metrics" | "camera";

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
              { id: "camera", label: "Camera", icon: Camera },
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
          {pane === "camera" && <CameraDebugTab />}
        </div>
      </div>
    </div>
  );
}

// ── Camera Debug Tab ──────────────────────────────────────────────────────────

const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629";
const TIP_IDS = [4, 8, 12, 16, 20];
const MCP_IDS = [2, 5, 9, 13, 17];
const FINGER_NAMES = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
const FRAME_WINDOW_MAX = 24;
const CONF_THRESHOLD = 0.30;

function locateFile(file: string) { return `${MEDIAPIPE_CDN}/${file}`; }

function flattenLandmarks(lms: { x: number; y: number; z: number }[] | null | undefined): number[] {
  if (!lms) return [];
  return lms.flatMap((l) => [l.x, l.y, l.z]);
}

function computeExtensions(lms: { x: number; y: number; z: number }[]): number[] {
  const w = lms[0];
  const d = (a: typeof w, b: typeof w) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  return TIP_IDS.map((t, i) => d(lms[t], w) / (d(lms[MCP_IDS[i]], w) + 1e-6));
}

function computePinch(lms: { x: number; y: number; z: number }[]): number {
  const d = (a: typeof lms[0], b: typeof lms[0]) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  return d(lms[4], lms[8]);
}

function extLabel(v: number): { label: string; color: string } {
  if (v > 1.5) return { label: "extended", color: "text-emerald-400" };
  if (v > 1.1) return { label: "partial", color: "text-amber-400" };
  return { label: "curled", color: "text-rose-400" };
}

type WsStatus = "idle" | "connecting" | "open" | "error" | "closed";
interface ClassEntry { sign: string; conf: number; ts: number; buffered: boolean; }
interface RawMsg { ts: number; raw: string; }

function CameraDebugTab() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const holisticRef = useRef<InstanceType<typeof import("@mediapipe/holistic").Holistic> | null>(null);
  const rafRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [mpStatus, setMpStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [wsStatus, setWsStatus] = useState<WsStatus>("idle");
  const [handDetected, setHandDetected] = useState<"none" | "left" | "right">("none");
  const [extensions, setExtensions] = useState<number[]>([0, 0, 0, 0, 0]);
  const [pinchDist, setPinchDist] = useState(0);
  const [framesProcessed, setFramesProcessed] = useState(0);
  const [framesSent, setFramesSent] = useState(0);
  const [frameWindowEst, setFrameWindowEst] = useState(0);
  const [classHistory, setClassHistory] = useState<ClassEntry[]>([]);
  const [signBuffer, setSignBuffer] = useState<string[]>([]);
  const [lastSentence, setLastSentence] = useState("");
  const [rawMessages, setRawMessages] = useState<RawMsg[]>([]);

  // Derive WS URL from env (swap endpoint)
  function getWsUrl(): string {
    try {
      const u = new URL(env.wsUrl);
      u.pathname = "/ws/simulator";
      return u.toString();
    } catch {
      return env.wsUrl;
    }
  }

  function pushRaw(raw: string) {
    setRawMessages((prev) => [{ ts: Date.now(), raw }, ...prev].slice(0, 80));
  }

  function connectWs() {
    const url = getWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setWsStatus("connecting");

    ws.onopen = () => {
      setWsStatus("open");
      ws.send(JSON.stringify({ type: "start", mode: "isl2speech", sessionId: "camera-debug" }));
    };
    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => setWsStatus("closed");
    ws.onmessage = (evt) => {
      pushRaw(evt.data);
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "transcript" && msg.text) {
          const buffered = msg.partial === true && msg.confidence >= CONF_THRESHOLD;
          setClassHistory((prev) => [
            { sign: msg.text, conf: msg.confidence, ts: Date.now(), buffered },
            ...prev,
          ].slice(0, 20));
          if (buffered) {
            setSignBuffer((prev) => {
              const last = prev[prev.length - 1];
              return last === msg.text ? prev : [...prev, msg.text];
            });
          }
        } else if (msg.type === "tts_ready") {
          setLastSentence(msg.captions ?? "");
          setSignBuffer([]);
        }
      } catch { /* ignore parse errors */ }
    };
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const { Holistic } = await import("@mediapipe/holistic");
      const origErr = console.error;
      console.error = (...args: unknown[]) => {
        const s = new Error().stack ?? "";
        if (s.includes("holistic_solution_") || s.includes("_fd_write")) return;
        origErr.apply(console, args as []);
      };

      setMpStatus("loading");
      const holistic = new Holistic({ locateFile });
      holistic.setOptions({
        modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false,
        refineFaceLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
      });

      holistic.onResults((results) => {
        setMpStatus("ready");
        setFramesProcessed((n) => n + 1);

        const rh = results.rightHandLandmarks;
        const lh = results.leftHandLandmarks;
        const hand = rh ? "right" : lh ? "left" : "none";
        setHandDetected(hand);

        const lms = rh ?? lh;
        if (lms) {
          setExtensions(computeExtensions(lms));
          setPinchDist(computePinch(lms));
        }

        const frame = {
          pose: flattenLandmarks(results.poseLandmarks),
          leftHand: flattenLandmarks(lh),
          rightHand: flattenLandmarks(rh),
          face: flattenLandmarks(results.faceLandmarks),
        };
        const hasHand = frame.leftHand.length > 0 || frame.rightHand.length > 0;
        if (hasHand && wsRef.current?.readyState === WebSocket.OPEN) {
          const seq = seqRef.current++;
          wsRef.current.send(JSON.stringify({ type: "landmarks", seq, frame }));
          setFramesSent((n) => n + 1);
          setFrameWindowEst((n) => Math.min(n + 1, FRAME_WINDOW_MAX));
        }
      });

      holisticRef.current = holistic;
      seqRef.current = 0;

      let lastSend = 0;
      const tick = () => {
        const now = performance.now();
        const video = videoRef.current;
        if (now - lastSend >= 66 && video && video.readyState >= 2) {
          lastSend = now;
          holistic.send({ image: video }).catch(() => {});
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      connectWs();
      setCameraActive(true);
      setCamError(null);
    } catch (e: unknown) {
      setCamError(e instanceof Error ? e.message : "Camera denied");
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    holisticRef.current?.close();
    holisticRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    try { wsRef.current?.send(JSON.stringify({ type: "stop" })); } catch { /* ignore */ }
    wsRef.current?.close();
    wsRef.current = null;
    setCameraActive(false);
    setHandDetected("none");
    setExtensions([0, 0, 0, 0, 0]);
    setWsStatus("idle");
    setMpStatus("idle");
    setFramesProcessed(0);
    setFramesSent(0);
    setFrameWindowEst(0);
  }

  function clearAll() {
    setClassHistory([]);
    setSignBuffer([]);
    setLastSentence("");
    setRawMessages([]);
    setFramesSent(0);
    setFramesProcessed(0);
    setFrameWindowEst(0);
  }

  useEffect(() => () => stopCamera(), []);

  const wsColor = {
    idle: "text-zinc-500", connecting: "text-amber-400",
    open: "text-emerald-400", error: "text-rose-400", closed: "text-zinc-500",
  }[wsStatus];

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-3">
          <Button
            onClick={cameraActive ? stopCamera : startCamera}
            className="gap-2"
            variant={cameraActive ? "secondary" : "primary"}
          >
            {cameraActive ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            {cameraActive ? "Stop Camera" : "Start Camera"}
          </Button>

          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className={cn("h-2 w-2 rounded-full inline-block", {
              "bg-zinc-500": wsStatus === "idle" || wsStatus === "closed",
              "bg-amber-400 animate-pulse": wsStatus === "connecting",
              "bg-emerald-400": wsStatus === "open",
              "bg-rose-400": wsStatus === "error",
            })} />
            <span className={wsColor}>WS: {wsStatus}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className={cn("h-2 w-2 rounded-full inline-block", {
              "bg-zinc-500": mpStatus === "idle",
              "bg-amber-400 animate-pulse": mpStatus === "loading",
              "bg-emerald-400": mpStatus === "ready",
            })} />
            <span className={mpStatus === "ready" ? "text-emerald-400" : mpStatus === "loading" ? "text-amber-400" : "text-zinc-500"}>
              MP: {mpStatus}
            </span>
          </div>

          <span className="text-xs font-mono text-muted">
            Processed: <span className="text-ink font-semibold">{framesProcessed}</span>
            {" · "}
            Sent: <span className={cn("font-semibold", framesSent > 0 ? "text-emerald-400" : "text-ink")}>{framesSent}</span>
            {framesProcessed > 0 && framesSent === 0 && (
              <span className="text-amber-400 ml-1">(no hand detected)</span>
            )}
          </span>

          {handDetected !== "none" && (
            <Badge variant="muted" className="font-mono text-emerald-400">
              ● {handDetected.toUpperCase()} hand
            </Badge>
          )}

          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {camError && (
        <p className="text-xs text-rose-400 font-mono px-1">{camError}</p>
      )}

      {/* Main grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Left: camera + extensions */}
        <div className="space-y-4">
          {/* Video */}
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-white/10">
                <video
                  ref={videoRef}
                  playsInline muted
                  className={cn("w-full h-full object-cover", !cameraActive && "hidden")}
                />
                {!cameraActive && (
                  <div className="absolute inset-0 grid place-items-center">
                    <CameraOff className="h-10 w-10 text-zinc-600" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Finger extensions */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] uppercase tracking-wider text-brand-purple font-semibold mb-3">
                Finger Extensions (mirrors classifier)
              </p>
              <div className="space-y-2">
                {FINGER_NAMES.map((name, i) => {
                  const v = extensions[i] ?? 0;
                  const { label, color } = extLabel(v);
                  const pct = Math.min(100, (v / 2.5) * 100);
                  return (
                    <div key={name} className="flex items-center gap-3 text-xs font-mono">
                      <span className="w-12 text-muted shrink-0">{name[0]}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-75", {
                            "bg-emerald-400": v > 1.5,
                            "bg-amber-400": v > 1.1 && v <= 1.5,
                            "bg-rose-400": v <= 1.1,
                          })}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-ink">{v.toFixed(2)}</span>
                      <span className={cn("w-16 shrink-0", color)}>{label}</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 text-xs font-mono mt-1 pt-2 border-t border-white/5">
                  <span className="w-12 text-muted shrink-0">Pinch</span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#8B5CF6] transition-all duration-75"
                      style={{ width: `${Math.min(100, pinchDist * 200)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-ink">{pinchDist.toFixed(2)}</span>
                  <span className="w-16 shrink-0 text-muted">
                    {pinchDist < 0.25 ? "pinching" : "open"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: classification history */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] uppercase tracking-wider text-brand-purple font-semibold mb-3">
                Classification History
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
                {classHistory.length === 0 ? (
                  <p className="text-xs text-muted italic">Start camera and show a hand sign…</p>
                ) : (
                  classHistory.map((e, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-zinc-500 shrink-0 w-16">
                        {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className={cn("w-16 font-semibold shrink-0", e.buffered ? "text-ink" : "text-zinc-500")}>
                        {e.sign}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", e.conf >= CONF_THRESHOLD ? "bg-emerald-400" : "bg-zinc-600")}
                          style={{ width: `${e.conf * 100}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-muted">{Math.round(e.conf * 100)}%</span>
                      <span className={cn("w-20 shrink-0", e.buffered ? "text-emerald-400" : "text-zinc-600")}>
                        {e.buffered ? "✓ buffered" : "✗ low conf"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sign buffer + sentence */}
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] uppercase tracking-wider text-brand-purple font-semibold">
                    Sign Buffer
                  </p>
                  <span className="text-[11px] font-mono text-muted">
                    Window ~{frameWindowEst}/{FRAME_WINDOW_MAX} frames
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-8">
                  {signBuffer.length === 0 ? (
                    <span className="text-xs text-muted italic">empty</span>
                  ) : (
                    signBuffer.map((s, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[11px] font-mono font-semibold text-[#8B5CF6]"
                      >
                        {s}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <p className="text-[11px] uppercase tracking-wider text-brand-purple font-semibold mb-1">
                  Last Sentence
                </p>
                {lastSentence ? (
                  <p className="text-sm text-white font-inter">"{lastSentence}"</p>
                ) : (
                  <p className="text-xs text-muted italic">Waiting for 1.5s silence to flush buffer…</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Raw WS messages */}
      <Card>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
          <p className="text-[11px] uppercase tracking-wider text-brand-purple font-semibold">
            Raw WebSocket Messages
          </p>
          <Button variant="ghost" size="sm" onClick={() => setRawMessages([])} className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
        <div className="h-48 overflow-y-auto scrollbar-thin font-mono text-xs bg-black/60 text-zinc-300 p-4 space-y-0.5 rounded-b-xl2">
          {rawMessages.length === 0 ? (
            <span className="text-zinc-500 italic">No messages yet.</span>
          ) : (
            rawMessages.map((m, i) => {
              let parsed: Record<string, unknown> | null = null;
              try { parsed = JSON.parse(m.raw); } catch { /* ignore */ }
              const type = (parsed?.type as string) ?? "?";
              const typeColor = type === "transcript" ? "text-[#8B5CF6]"
                : type === "tts_ready" ? "text-emerald-400"
                : type === "error" ? "text-rose-400"
                : type === "log" ? "text-amber-400"
                : "text-zinc-400";
              return (
                <div key={i} className="flex gap-3 leading-relaxed">
                  <span className="text-zinc-600 shrink-0 w-20">
                    {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className={cn("shrink-0 w-20 font-semibold", typeColor)}>{type}</span>
                  <span className="text-zinc-400 truncate">{m.raw}</span>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Existing components (unchanged) ──────────────────────────────────────────

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
            Waiting for events… Start the simulator to stream logs.
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
