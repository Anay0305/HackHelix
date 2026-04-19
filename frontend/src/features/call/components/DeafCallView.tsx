/**
 * Deaf person's in-call view.
 * - Camera → MediaPipe → landmarks → call socket → (backend classify→TTS) → hearing person
 * - Receives pose_sequence / gloss from hearing person's speech → avatar animates
 * - Shows recognized sign + confidence bar
 * - Gloss text fallback for direct flush
 */
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, Send, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { AvatarStage } from "@/features/simulator/components/avatar/AvatarStage";
import { useSimulatorStore } from "@/store/simulatorStore";
import type { CallSocket } from "../hooks/useCallSocket";

const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629";
function locateFile(file: string) { return `${MEDIAPIPE_CDN}/${file}`; }
function flattenLandmarks(lms: { x: number; y: number; z: number }[] | null | undefined): number[] {
  if (!lms) return [];
  return lms.flatMap((l) => [l.x, l.y, l.z]);
}

export function DeafCallView({ socket }: { socket: CallSocket }) {
  const [cameraActive, setCameraActive] = useState(false);
  const [camError, setCamError]         = useState<string | null>(null);
  const videoRef    = useRef<HTMLVideoElement | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const holisticRef = useRef<InstanceType<typeof import("@mediapipe/holistic").Holistic> | null>(null);
  const rafRef      = useRef<number | null>(null);
  const seqRef      = useRef(0);

  const recognized           = useSimulatorStore((s) => s.recognized);
  const recognizedConfidence = useSimulatorStore((s) => s.recognizedConfidence);
  const ttsHistory           = useSimulatorStore((s) => s.ttsHistory);

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
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        const stack = new Error().stack ?? "";
        if (stack.includes("holistic_solution_") || stack.includes("_fd_write")) return;
        origError.apply(console, args as []);
      };

      const holistic = new Holistic({ locateFile });
      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        refineFaceLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      holistic.onResults((results) => {
        const frame = {
          pose:      flattenLandmarks(results.poseLandmarks),
          leftHand:  flattenLandmarks(results.leftHandLandmarks),
          rightHand: flattenLandmarks(results.rightHandLandmarks),
          face:      flattenLandmarks(results.faceLandmarks),
        };
        const hasHand = frame.leftHand.length > 0 || frame.rightHand.length > 0;
        if (hasHand) {
          socket.send({ type: "landmarks", seq: seqRef.current++, frame });
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
    setCameraActive(false);
  }

  useEffect(() => () => stopCamera(), []);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Avatar — hearing person's speech → ISL */}
      <section className="h-64 shrink-0 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-4 pt-3 font-space-grotesk">
          ISL Avatar (hearing person speaking)
        </p>
        <AvatarStage />
      </section>

      {/* Camera + signing */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
            Your Camera
          </p>
          {cameraActive && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-inter">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* Video preview */}
        <div
          className={cn(
            "relative aspect-video rounded-xl overflow-hidden border bg-black",
            cameraActive
              ? "border-[#8B5CF6]/60 shadow-[0_0_40px_rgba(139,92,246,0.25)]"
              : "border-white/10",
          )}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn("w-full h-full object-cover", !cameraActive && "hidden")}
          />
          {!cameraActive && (
            <div className="absolute inset-0 flex items-center justify-center">
              <CameraOff className="h-10 w-10 text-zinc-600" />
            </div>
          )}
        </div>

        <button
          onClick={cameraActive ? stopCamera : startCamera}
          className={cn(
            "flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold font-space-grotesk transition-all",
            cameraActive
              ? "bg-zinc-800 border border-white/10 text-zinc-300 hover:bg-zinc-700"
              : "bg-gradient-to-r from-[#8B5CF6] to-[#C05177] text-white hover:shadow-[0_6px_24px_rgba(139,92,246,0.45)]",
          )}
        >
          {cameraActive ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {cameraActive ? "Stop Camera" : "Start Signing"}
        </button>

        {camError && <p className="text-xs text-red-400 font-inter">{camError}</p>}

        {/* Recognized sign confidence */}
        {recognized && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] font-inter">
              <span className="text-zinc-400">Recognized:</span>
              <span className="text-[#8B5CF6] font-semibold">{recognized}</span>
              <span className="text-zinc-500">{Math.round(recognizedConfidence * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#C05177] transition-all duration-300"
                style={{ width: `${recognizedConfidence * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Gloss text fallback */}
        <GlossInput socket={socket} />
      </section>

      {/* What hearing person said (TTS captions) */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-[#8B5CF6]" />
          Hearing person said
        </p>
        <div className="space-y-1.5 max-h-24 overflow-y-auto scrollbar-thin">
          {ttsHistory.length === 0 ? (
            <p className="text-xs text-zinc-600 italic font-inter">
              Their speech will appear here as ISL avatar animation.
            </p>
          ) : (
            ttsHistory.map((h) => (
              <p key={h.id} className="text-sm text-white font-inter">
                {h.text}
              </p>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

const QUICK_GLOSSES = [
  "ME UNDERSTAND",
  "ME UNDERSTAND NOT",
  "YOU REPEAT PLEASE",
  "ME WATER WANT",
  "ME OKAY",
  "THANK_YOU",
];

function GlossInput({ socket }: { socket: CallSocket }) {
  const [text, setText] = useState("");
  const [show, setShow] = useState(false);

  function send(gloss: string) {
    const t = gloss.trim().toUpperCase();
    if (!t) return;
    socket.send({ type: "gloss_text", payload: t, sessionId: "call" });
    setText("");
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setShow((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors font-inter self-start"
      >
        <Keyboard className="h-3.5 w-3.5" />
        {show ? "Hide gloss input" : "Type gloss instead"}
      </button>

      {show && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(text)}
              placeholder="ME WATER WANT…"
              className="flex-1 bg-zinc-950/70 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#8B5CF6]/60 transition-colors font-inter"
            />
            <button
              onClick={() => send(text)}
              disabled={!text.trim()}
              className="px-3 py-2 rounded-xl text-sm bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[#8B5CF6] disabled:opacity-40 hover:bg-[#8B5CF6]/30 transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_GLOSSES.map((g) => (
              <button
                key={g}
                onClick={() => send(g)}
                className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-mono text-zinc-400 hover:text-white hover:border-[#8B5CF6]/40 transition-all"
              >
                {g}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
