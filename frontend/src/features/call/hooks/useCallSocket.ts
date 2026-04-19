/**
 * WebSocket hook for the bi-directional ISL call.
 * Connects to /ws/call/{roomId}?role={role} and dispatches
 * incoming messages to the simulator store (so AvatarStage etc. work unchanged).
 */
import { useEffect, useRef, useState } from "react";
import { env } from "@/lib/env";
import type { ClientMsg, ServerMsg } from "@/api/types";
import type { WsStatus } from "@/api/socket";
import { useSimulatorStore } from "@/store/simulatorStore";
import { toast } from "sonner";

export type CallRole = "hearing" | "deaf";

function callWsUrl(roomId: string, role: CallRole): string {
  const base = env.wsUrl.replace(/\/ws\/simulator$/, "");
  return `${base}/ws/call/${roomId}?role=${role}`;
}

export interface CallSocket {
  status: WsStatus;
  partnerConnected: boolean;
  send: (msg: ClientMsg) => void;
  disconnect: () => void;
}

export function useCallSocket(roomId: string, role: CallRole): CallSocket {
  const wsRef   = useRef<WebSocket | null>(null);
  const seqRef  = useRef(0);
  const [status, setStatus] = useState<WsStatus>("idle");
  const [partnerConnected, setPartnerConnected] = useState(false);

  const setWsStatus      = useSimulatorStore((s) => s.setWsStatus);
  const setGloss         = useSimulatorStore((s) => s.setGloss);
  const setAvatarCue     = useSimulatorStore((s) => s.setAvatarCue);
  const setRecognized    = useSimulatorStore((s) => s.setRecognized);
  const appendTts        = useSimulatorStore((s) => s.appendTts);
  const setPoseSequence  = useSimulatorStore((s) => s.setPoseSequence);
  const appendTranscript = useSimulatorStore((s) => s.appendTranscript);

  useEffect(() => {
    const url = callWsUrl(roomId, role);
    const ws  = new WebSocket(url);
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      setStatus("open");
      setWsStatus("open");
    };

    ws.onmessage = (evt) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(evt.data) as ServerMsg;
      } catch {
        return;
      }

      switch (msg.type) {
        case "partner_joined":
          setPartnerConnected(true);
          toast.success("Partner joined the call!");
          break;

        case "partner_left":
          setPartnerConnected(false);
          toast.warning("Partner left the call.");
          break;

        case "transcript":
          setRecognized(msg.text, msg.confidence);
          if (role === "hearing") {
            appendTranscript({
              id: `${msg.timestampMs}-${seqRef.current++}`,
              text: msg.text,
              confidence: msg.confidence,
              partial: msg.partial,
              timestampMs: msg.timestampMs,
            });
          }
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

        case "pose_sequence":
          setPoseSequence({
            words: msg.words,
            msPerFrame: msg.msPerFrame,
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
          if (msg.audioUrl) {
            new Audio(msg.audioUrl).play().catch(() => {});
          } else if ("speechSynthesis" in window) {
            const u = new SpeechSynthesisUtterance(msg.captions);
            window.speechSynthesis.speak(u);
          }
          break;

        case "error":
          toast.error(`${msg.code}: ${msg.msg}`, { duration: 8000 });
          break;

        case "log":
          if (msg.level === "warn") toast.warning(msg.msg);
          break;

        default:
          break;
      }
    };

    ws.onerror = () => {
      setStatus("error");
      setWsStatus("error");
    };

    ws.onclose = () => {
      setStatus("closed");
      setWsStatus("closed");
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, role]);

  function send(msg: ClientMsg) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  function disconnect() {
    wsRef.current?.close();
  }

  return { status, partnerConnected, send, disconnect };
}
