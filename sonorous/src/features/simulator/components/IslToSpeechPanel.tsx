import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CameraOff, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Progress } from "@/components/ui/Progress";
import { useSimulatorStore } from "@/store/simulatorStore";
import { useWebcamCapture } from "../hooks/useWebcamCapture";
import { getSocket } from "@/api/socket";
import { shortId, formatTime } from "@/lib/format";

export function IslToSpeechPanel() {
  const webcam = useWebcamCapture();
  const isLive = useSimulatorStore((s) => s.isLive);
  const setIsLive = useSimulatorStore((s) => s.setIsLive);
  const recognized = useSimulatorStore((s) => s.recognized);
  const confidence = useSimulatorStore((s) => s.recognizedConfidence);
  const ttsHistory = useSimulatorStore((s) => s.ttsHistory);
  const setSessionId = useSimulatorStore((s) => s.setSessionId);

  useEffect(() => {
    return () => {
      if (isLive) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    await webcam.start();
    const id = `sess-${shortId()}`;
    setSessionId(id);
    setIsLive(true);
    getSocket().send({ type: "start", mode: "isl2speech", sessionId: id });
  }

  function stop() {
    webcam.stop();
    getSocket().send({ type: "stop" });
    setIsLive(false);
    setSessionId(null);
  }

  return (
    <div className="flex flex-col gap-5 h-full text-ink">
      <div className="flex items-center justify-center">
        <CameraButton active={webcam.isActive} onClick={isLive ? stop : start} />
      </div>

      {/* Webcam preview */}
      <div
        className={cn(
          "relative aspect-video rounded-xl2 overflow-hidden border",
          isLive ? "border-brand-purple/60 shadow-glow-brand" : "border-white/10",
        )}
      >
        <video
          ref={webcam.videoRef}
          playsInline
          muted
          className={cn(
            "w-full h-full object-cover bg-black",
            !webcam.isActive && "hidden",
          )}
          style={{ transform: "scaleX(-1)" }}
          aria-label="Your webcam preview"
        />
        {!webcam.isActive && (
          <div className="absolute inset-0 grid place-items-center glass-subtle">
            <div className="text-center">
              <Camera
                className="h-8 w-8 mx-auto mb-2 text-muted opacity-60"
                aria-hidden
              />
              <p className="text-xs text-muted">Camera off</p>
            </div>
          </div>
        )}
        {webcam.isActive && <LandmarkOverlay />}
      </div>

      {/* Recognition output */}
      <section
        aria-label="Recognized speech"
        className="rounded-lg glass p-4 space-y-3"
      >
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-muted">
            Recognized
          </span>
          <span className="font-mono text-muted">
            {Math.round(confidence * 100)}%
          </span>
        </div>
        <Progress
          value={confidence}
          color={confidence >= 0.75 ? "emerald" : "amber"}
        />
        <p className="text-base font-medium min-h-[1.5em]">
          {recognized || (
            <span className="text-muted italic font-normal">
              Sign to see the recognised sentence here.
            </span>
          )}
        </p>
      </section>

      {/* History */}
      <section aria-label="Spoken utterance history">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">
          Voice History
        </p>
        <div className="rounded-lg glass divide-y divide-white/5 max-h-44 overflow-y-auto scrollbar-thin">
          {ttsHistory.length === 0 ? (
            <p className="p-4 text-xs text-muted italic">
              Spoken utterances appear here.
            </p>
          ) : (
            <AnimatePresence initial={false}>
              {ttsHistory.map((h) => (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-3 px-4 py-2.5"
                >
                  <Volume2
                    className="h-4 w-4 mt-0.5 text-brand-purple shrink-0"
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{h.text}</p>
                    <p className="text-[11px] text-muted">
                      {formatTime(h.timestampMs)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </section>

      {webcam.error && (
        <p role="alert" className="text-xs text-brand-rose">
          Camera: {webcam.error}
        </p>
      )}
    </div>
  );
}

function CameraButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={active ? "Stop sign-to-speech translation" : "Start sign-to-speech translation"}
      aria-pressed={active}
      className={cn(
        "relative h-24 w-24 rounded-full grid place-items-center transition-all p-4 focus-ring",
        active
          ? "bg-brand-primary text-white shadow-[0_12px_40px_rgba(139,92,246,0.55)]"
          : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-white/10 active:scale-95",
      )}
    >
      {active ? (
        <Camera className="h-9 w-9" aria-hidden strokeWidth={2.2} />
      ) : (
        <CameraOff className="h-9 w-9" aria-hidden strokeWidth={2.2} />
      )}
      {active && (
        <>
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-brand-primary/70 animate-pulse-ring"
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border border-brand-tertiary/50 scale-110"
          />
        </>
      )}
    </button>
  );
}

function LandmarkOverlay() {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const svg = ref.current;
      if (!svg) return;
      const t = Date.now() / 800;
      const dots = svg.querySelectorAll<SVGCircleElement>("circle");
      dots.forEach((c, i) => {
        const phase = i / dots.length;
        const x = 50 + Math.sin(t + phase * 6) * 15;
        const y = 50 + Math.cos(t * 1.2 + phase * 8) * 12;
        c.setAttribute("cx", `${x}%`);
        c.setAttribute("cy", `${y}%`);
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
    >
      {Array.from({ length: 21 }).map((_, i) => (
        <circle
          key={i}
          r="3"
          cx="50%"
          cy="50%"
          fill={i < 10 ? "#8B5CF6" : "#C05177"}
          opacity="0.9"
        />
      ))}
    </svg>
  );
}

