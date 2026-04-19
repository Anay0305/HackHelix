import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getSocket } from "@/api/socket";
import { useSimulatorStore } from "@/store/simulatorStore";
import { useDebuggerStore } from "@/store/debuggerStore";
import type { ServerMsg } from "@/api/types";

/**
 * Wires the simulator WebSocket to Zustand stores.
 * Mount once on the Simulator page.
 */
export function useSimulatorSocket() {
  const setWsStatus     = useSimulatorStore((s) => s.setWsStatus);
  const appendTranscript = useSimulatorStore((s) => s.appendTranscript);
  const setGloss        = useSimulatorStore((s) => s.setGloss);
  const setAvatarCue    = useSimulatorStore((s) => s.setAvatarCue);
  const setRecognized   = useSimulatorStore((s) => s.setRecognized);
  const appendTts       = useSimulatorStore((s) => s.appendTts);
  const setLatency      = useSimulatorStore((s) => s.setLatency);
  const setAlert          = useSimulatorStore((s) => s.setAlert);
  const setEmotion        = useSimulatorStore((s) => s.setEmotion);
  const setPoseSequence   = useSimulatorStore((s) => s.setPoseSequence);
  const mode              = useSimulatorStore((s) => s.mode);

  const pushLog        = useDebuggerStore((s) => s.pushLog);
  const setLastPayload = useDebuggerStore((s) => s.setLastPayload);
  const pushConfidence = useDebuggerStore((s) => s.pushConfidence);
  const pushLatency    = useDebuggerStore((s) => s.pushLatency);

  // Auto-dismiss alert after 8 s
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    const offStatus = socket.onStatus((s) => {
      setWsStatus(s);
      if (s === "error") {
        toast.error("WebSocket error — is the backend running on port 8000?", {
          id: "ws-conn-error",
          duration: 10_000,
        });
      }
    });
    const offMsg = socket.onMessage((msg: ServerMsg) => {
      // ── [Phase 15] Unified receiver with aggressive tracing ──────────────
      // Log EVERY payload up front so we can tell the flow dead if the
      // backend never replies vs. replies with an unexpected shape.
      console.log("[WS RECEIVE] Payload:", msg);
      setLastPayload(msg);

      // ── Phase 15 flat-shape contracts ────────────────────────────────────
      // The backend mirrors the typed {type:"gloss"} message with a flat
      // {transcription,gloss} for English->ISL, and emits {type:"english_output"}
      // for ISL->English. We recognise both here BEFORE the legacy switch so
      // the UI updates even if only the flat shapes arrive.
      const anyMsg = msg as unknown as Record<string, unknown>;
      if (
        typeof anyMsg.transcription === "string" &&
        typeof anyMsg.gloss === "string"
      ) {
        console.log(
          "[WS RECEIVE] flat English->ISL →",
          anyMsg.transcription,
          "|",
          anyMsg.gloss,
        );
        const transcription = anyMsg.transcription as string;
        const glossStr = anyMsg.gloss as string;
        // Push the English text into the transcript history so the "Recognized
        // Sentence" box renders it.
        appendTranscript({
          id: `flat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: transcription,
          confidence: 1,
          partial: false,
          timestampMs: Date.now(),
        });
        // Fan the gloss string out into tokens the avatar + pill UI expect.
        const tokens = glossStr
          .split(/\s+/)
          .filter(Boolean)
          .map((g, i) => ({
            gloss: g.toUpperCase(),
            startMs: i * 300,
            endMs: (i + 1) * 300,
          }));
        setGloss(tokens, transcription, "neutral");
        // Don't return — let the legacy switch also run in case the backend
        // sends both shapes in one payload (belt + suspenders).
      }
      if (anyMsg.type === "english_output") {
        console.log("[WS RECEIVE] english_output →", anyMsg.transcription);
        if (typeof anyMsg.transcription === "string") {
          setRecognized(anyMsg.transcription, 1);
        }
      }

      switch (msg.type) {
        case "transcript": {
          // Read mode live, not via the stale closure — the component may
          // render the ISL panel without anyone having called setMode().
          const liveMode = useSimulatorStore.getState().mode;
          if (liveMode === "speech2isl") {
            appendTranscript({
              id: `${msg.timestampMs}-${Math.random().toString(36).slice(2, 6)}`,
              text: msg.text,
              confidence: msg.confidence,
              partial: msg.partial,
              timestampMs: msg.timestampMs,
            });
          }
          // Always update RECOGNIZED — if the ISL panel is on screen it'll
          // render this; if not, it's harmless.
          setRecognized(msg.text, msg.confidence);
          pushConfidence(msg.confidence);
          break;
        }

        case "gloss":
          setGloss(msg.tokens, msg.sourceText, msg.sentiment ?? "neutral");
          break;

        case "avatar_cue":
          setAvatarCue({
            clip: msg.clip,
            morphTargets: msg.morphTargets,
            durationMs: msg.durationMs,
            startedAt: performance.now(),
          });
          break;

        case "tts_ready": {
          appendTts({
            id: `tts-${Date.now()}`,
            text: msg.captions,
            audioUrl: msg.audioUrl,
            timestampMs: Date.now(),
          });
          if (msg.audioUrl) {
            // Play TTS audio returned by ElevenLabs
            const audio = new Audio(msg.audioUrl);
            audio.play().catch(() => {});
          } else if ("speechSynthesis" in window) {
            // Fallback to Web Speech API when backend returns no URL
            const u = new SpeechSynthesisUtterance(msg.captions);
            u.rate = 1.0;
            window.speechSynthesis.speak(u);
          }
          break;
        }

        case "alert":
          if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
          setAlert({ alertType: msg.alertType, confidence: msg.confidence, label: msg.label, seenAt: Date.now() });
          alertTimerRef.current = setTimeout(() => setAlert(null), 8000);
          break;

        case "emotion":
          setEmotion({ emotion: msg.emotion, intensity: msg.intensity, morphTargets: msg.morphTargets });
          break;

        case "pose_sequence":
          setPoseSequence({
            words: msg.words,
            msPerFrame: msg.msPerFrame,
            startedAt: performance.now(),
          });
          break;

        case "log":
          pushLog({ level: msg.level, msg: msg.msg, latencyMs: msg.latencyMs, meta: msg.meta });
          if (typeof msg.latencyMs === "number") {
            setLatency(msg.latencyMs);
            pushLatency(msg.latencyMs);
          }
          if (msg.level === "warn") toast.warning(msg.msg);
          break;

        case "error": {
          const errText = `${msg.code}: ${msg.msg}`;
          pushLog({ level: "error", msg: errText });
          toast.error(errText, { duration: 8000 });
          break;
        }

        case "pong":
          setLatency(performance.now() - msg.t);
          break;
      }
    });

    return () => {
      offStatus();
      offMsg();
      socket.disconnect();
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
}
