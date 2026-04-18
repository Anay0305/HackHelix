import { useEffect } from "react";
import { getSocket } from "@/api/socket";
import { useSimulatorStore } from "@/store/simulatorStore";
import { useDebuggerStore } from "@/store/debuggerStore";
import type { ServerMsg } from "@/api/types";

/**
 * Wires the simulator WebSocket to Zustand stores.
 * One hook to rule them all \u2014 mount once on the Simulator page.
 */
export function useSimulatorSocket() {
  const setWsStatus = useSimulatorStore((s) => s.setWsStatus);
  const appendTranscript = useSimulatorStore((s) => s.appendTranscript);
  const setGloss = useSimulatorStore((s) => s.setGloss);
  const setAvatarCue = useSimulatorStore((s) => s.setAvatarCue);
  const setRecognized = useSimulatorStore((s) => s.setRecognized);
  const appendTts = useSimulatorStore((s) => s.appendTts);
  const setLatency = useSimulatorStore((s) => s.setLatency);
  const mode = useSimulatorStore((s) => s.mode);

  const pushLog = useDebuggerStore((s) => s.pushLog);
  const setLastPayload = useDebuggerStore((s) => s.setLastPayload);
  const pushConfidence = useDebuggerStore((s) => s.pushConfidence);
  const pushLatency = useDebuggerStore((s) => s.pushLatency);

  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    const offStatus = socket.onStatus((s) => setWsStatus(s));
    const offMsg = socket.onMessage((msg: ServerMsg) => {
      setLastPayload(msg);

      switch (msg.type) {
        case "transcript":
          if (mode === "speech2isl") {
            appendTranscript({
              id: `${msg.timestampMs}-${Math.random().toString(36).slice(2, 6)}`,
              text: msg.text,
              confidence: msg.confidence,
              partial: msg.partial,
              timestampMs: msg.timestampMs,
            });
          } else {
            setRecognized(msg.text, msg.confidence);
          }
          pushConfidence(msg.confidence);
          break;

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

        case "tts_ready":
          appendTts({
            id: `tts-${Date.now()}`,
            text: msg.captions,
            audioUrl: msg.audioUrl,
            timestampMs: Date.now(),
          });
          // Fallback to Web Speech API if no URL (mock)
          if (!msg.audioUrl && "speechSynthesis" in window) {
            const u = new SpeechSynthesisUtterance(msg.captions);
            u.rate = 1.0;
            window.speechSynthesis.speak(u);
          }
          break;

        case "log":
          pushLog({ level: msg.level, msg: msg.msg, latencyMs: msg.latencyMs, meta: msg.meta });
          if (typeof msg.latencyMs === "number") {
            setLatency(msg.latencyMs);
            pushLatency(msg.latencyMs);
          }
          break;

        case "error":
          pushLog({ level: "error", msg: `${msg.code}: ${msg.msg}` });
          break;

        case "pong":
          setLatency(performance.now() - msg.t);
          break;
      }
    });

    return () => {
      offStatus();
      offMsg();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
}
