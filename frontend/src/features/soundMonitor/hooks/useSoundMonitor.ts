import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSoundMonitorStore, type SoundAlert, type AlertType } from "@/store";
import { env } from "@/lib/env";
import type { WsStatus } from "@/api/socket";

/**
 * Stand-alone hook that owns a dedicated WebSocket to /ws/monitor.
 * Streams PCM16 mic audio up; receives YAMNet alerts down.
 * Independent of the simulator socket so the user can leave the Translate
 * page and still get background alerts.
 */

function float32ToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return out;
}

function uint8ToBase64(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function monitorWsUrl(): string {
  // Derive from env.wsUrl by swapping whatever /ws/<endpoint> suffix is present
  // for /ws/monitor. Covers dev (ws://localhost:8000/ws/simulator) and prod.
  try {
    const u = new URL(env.wsUrl);
    u.pathname = "/ws/monitor";
    return u.toString();
  } catch {
    // Fallback: regex swap for non-absolute URLs
    const base = env.wsUrl.replace(/\/ws\/[^/]+$/, "/ws/monitor");
    return base.endsWith("/ws/monitor") ? base : base.replace(/\/?$/, "/ws/monitor");
  }
}

export function useSoundMonitor() {
  const isLive     = useSoundMonitorStore((s) => s.isLive);
  const setIsLive  = useSoundMonitorStore((s) => s.setIsLive);
  const setStatus  = useSoundMonitorStore((s) => s.setWsStatus);
  const setBufMs   = useSoundMonitorStore((s) => s.setBufferedMs);
  const pushAlert  = useSoundMonitorStore((s) => s.pushAlert);

  const wsRef       = useRef<WebSocket | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const ctxRef      = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const rafRef       = useRef<number | null>(null);
  const levelRef     = useRef(0);

  const start = useCallback(async () => {
    try {
      // 1. mic
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,   // YAMNet needs raw loudness info
          channelCount:     1,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const sr = ctx.sampleRate;

      // 2. websocket
      const wsUrl = monitorWsUrl();
      // eslint-disable-next-line no-console
      console.info("[sound-monitor] connecting", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      const emitStatus = (s: WsStatus) => setStatus(s);
      emitStatus("connecting");

      ws.onopen = () => {
        // eslint-disable-next-line no-console
        console.info("[sound-monitor] connected");
        emitStatus("open");
        ws.send(JSON.stringify({ type: "start", sampleRate: sr }));
      };
      ws.onerror = (e) => {
        // eslint-disable-next-line no-console
        console.error("[sound-monitor] ws error", e);
        emitStatus("error");
        toast.error("Sound Monitor: cannot reach backend on /ws/monitor");
      };
      ws.onclose = (e) => {
        // eslint-disable-next-line no-console
        console.info("[sound-monitor] closed", e.code, e.reason);
        emitStatus("closed");
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "alert") {
            const alert: SoundAlert = {
              id: `${msg.timestampMs}-${msg.alertType}`,
              alertType:  msg.alertType as AlertType,
              confidence: msg.confidence,
              label:      msg.label,
              timestampMs: msg.timestampMs,
            };
            pushAlert(alert);
            // Lightweight toast — works when user is on another page
            toast(`${iconFor(alert.alertType)} ${humanLabel(alert.alertType)}`, {
              description: `${Math.round(alert.confidence * 100)}% · ${alert.label}`,
              duration: 6000,
            });
            // Per-type user-configurable vibration pattern
            if ("vibrate" in navigator) {
              const pattern =
                useSoundMonitorStore.getState().vibration[alert.alertType] ?? [];
              if (pattern.length > 0) navigator.vibrate(pattern);
            }
          } else if (msg.type === "status") {
            setBufMs(msg.bufferedMs);
          }
        } catch {
          /* ignore */
        }
      };

      // 3. analyser (for level bar)
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 4. PCM16 streaming
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(input);
        const b64 = uint8ToBase64(new Uint8Array(pcm16.buffer));
        wsRef.current.send(JSON.stringify({ type: "audio_chunk", pcm16Base64: b64 }));
      };
      source.connect(processor);
      processor.connect(ctx.destination);

      // 5. level tick
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        levelRef.current = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setIsLive(true);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Mic denied: ${e.message}`
          : "Microphone denied",
      );
      setIsLive(false);
    }
  }, [pushAlert, setBufMs, setIsLive, setStatus]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try {
      wsRef.current?.send(JSON.stringify({ type: "stop" }));
    } catch {
      /* ignore */
    }
    wsRef.current?.close();
    wsRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    setIsLive(false);
    setStatus("idle");
    setBufMs(0);
  }, [setBufMs, setIsLive, setStatus]);

  // Clean up on unmount only if we auto-started something. Otherwise leave
  // the monitor running so it persists across routes.
  useEffect(() => () => {
    // do NOT stop on unmount — we want background operation across page nav
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  return { isLive, start, stop, levelRef };
}

// ──────────────────────────────────────────────────────────────────────────────
// Labels
// ──────────────────────────────────────────────────────────────────────────────

export function humanLabel(t: AlertType): string {
  return (
    {
      fire_alarm: "Fire alarm",
      alarm:      "Alarm",
      doorbell:   "Doorbell",
      horn:       "Car horn",
      siren:      "Siren",
      phone:      "Phone ringing",
      bell:       "Bell",
      baby_cry:   "Baby crying",
    } as const
  )[t];
}

export function iconFor(t: AlertType): string {
  return (
    {
      fire_alarm: "🚨",
      alarm:      "⏰",
      doorbell:   "🔔",
      horn:       "🚗",
      siren:      "🚑",
      phone:      "📞",
      bell:       "🔔",
      baby_cry:   "👶",
    } as const
  )[t];
}

export function severityFor(t: AlertType): "critical" | "warn" | "info" {
  if (t === "fire_alarm" || t === "siren") return "critical";
  if (t === "horn" || t === "alarm" || t === "baby_cry") return "warn";
  return "info";
}
