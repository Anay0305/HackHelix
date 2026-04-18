import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CameraOff,
  Volume2,
  UploadCloud,
  X,
  Film,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Progress } from "@/components/ui/Progress";
import { useSimulatorStore } from "@/store/simulatorStore";
import { useWebcamCapture } from "../hooks/useWebcamCapture";
import { getSocket } from "@/api/socket";
import { shortId, formatTime } from "@/lib/format";

type InputMode = "live" | "video" | "photo";

export function IslToSpeechPanel() {
  const [inputMode, setInputMode] = useState<InputMode>("live");

  return (
    <div className="flex flex-col gap-5 h-full">
      <ModeToggle value={inputMode} onChange={setInputMode} />

      <div className="flex-1 min-h-0 flex flex-col gap-5">
        {inputMode === "live" && <LiveCameraMode />}
        {inputMode === "video" && <UploadMode accept="video/*" kind="video" />}
        {inputMode === "photo" && <UploadMode accept="image/*" kind="photo" />}
        <OutputSection />
      </div>
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: InputMode;
  onChange: (v: InputMode) => void;
}) {
  const options: { value: InputMode; label: string; icon: React.ReactNode }[] =
    [
      {
        value: "live",
        label: "Live Camera",
        icon: <Camera className="h-6 w-6" strokeWidth={2.2} aria-hidden />,
      },
      {
        value: "video",
        label: "Upload Video",
        icon: <Film className="h-6 w-6" strokeWidth={2.2} aria-hidden />,
      },
      {
        value: "photo",
        label: "Upload Photo",
        icon: <ImageIcon className="h-6 w-6" strokeWidth={2.2} aria-hidden />,
      },
    ];

  return (
    <div
      role="tablist"
      aria-label="ISL input mode"
      className="inline-flex self-center gap-2 p-1.5 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative grid place-items-center h-14 w-14 rounded-xl transition-all duration-200 focus-ring",
              active
                ? "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_6px_20px_rgba(139,92,246,0.45)]"
                : "text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95",
            )}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}

function LiveCameraMode() {
  const webcam = useWebcamCapture();
  const isLive = useSimulatorStore((s) => s.isLive);
  const setIsLive = useSimulatorStore((s) => s.setIsLive);
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
    <section
      aria-label="Live camera input"
      className="flex flex-col gap-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5"
    >
      <div className="flex items-center justify-center">
        <CameraButton
          active={webcam.isActive}
          onClick={isLive ? stop : start}
        />
      </div>

      <div
        className={cn(
          "relative aspect-video rounded-xl overflow-hidden border",
          isLive
            ? "border-[#8B5CF6]/60 shadow-[0_0_40px_rgba(139,92,246,0.35),0_0_80px_rgba(192,81,119,0.18)]"
            : "border-white/10",
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
          <div className="absolute inset-0 grid place-items-center bg-zinc-950/80 backdrop-blur-sm">
            <div className="text-center">
              <Camera
                className="h-8 w-8 mx-auto mb-2 text-zinc-500 opacity-60"
                aria-hidden
              />
              <p className="text-xs text-zinc-500 font-inter">Camera off</p>
            </div>
          </div>
        )}
        {webcam.isActive && <LandmarkOverlay />}
      </div>

      {webcam.error && (
        <p role="alert" className="text-xs text-[#C05177] font-inter">
          Camera: {webcam.error}
        </p>
      )}
    </section>
  );
}

function UploadMode({
  accept,
  kind,
}: {
  accept: string;
  kind: "video" | "photo";
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const setSessionId = useSimulatorStore((s) => s.setSessionId);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const ok =
      kind === "video" ? f.type.startsWith("video/") : f.type.startsWith("image/");
    if (!ok) return;
    setFile(f);
  }

  function handleAnalyze() {
    if (!file) return;
    const id = `sess-${shortId()}`;
    setSessionId(id);
    getSocket().send({ type: "start", mode: "isl2speech", sessionId: id });
    getSocket().send({
      type: kind === "video" ? "video" : "photo",
      mode: "isl2speech",
      sessionId: id,
      payload: { name: file.name, size: file.size, mime: file.type },
    } as never);
  }

  return (
    <section
      aria-label={`${kind === "video" ? "Video" : "Photo"} upload`}
      className="flex flex-col gap-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 font-inter"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
        {kind === "video" ? "Upload Sign Video" : "Upload Sign Photo"}
      </p>

      {!file ? (
        <label
          htmlFor={`isl-upload-${kind}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
          className={cn(
            "relative grid place-items-center rounded-xl cursor-pointer transition-all",
            "border-2 border-dashed aspect-video",
            dragging
              ? "border-[#8B5CF6] bg-gradient-to-br from-[#8B5CF6]/10 to-[#C05177]/10"
              : "border-white/15 bg-zinc-950/40 hover:border-white/25 hover:bg-zinc-950/60",
          )}
        >
          <input
            id={`isl-upload-${kind}`}
            type="file"
            accept={accept}
            onChange={(e) => onFiles(e.target.files)}
            className="sr-only"
          />
          <div className="text-center px-6">
            <div
              className={cn(
                "mx-auto mb-3 h-12 w-12 rounded-full grid place-items-center transition-all",
                dragging
                  ? "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] shadow-[0_6px_24px_rgba(139,92,246,0.45)]"
                  : "bg-white/5 border border-white/10",
              )}
            >
              <UploadCloud
                className={cn(
                  "h-6 w-6",
                  dragging ? "text-white" : "text-zinc-400",
                )}
                aria-hidden
              />
            </div>
            <p className="text-sm font-medium text-ink font-space-grotesk">
              Drop your {kind === "video" ? "sign video" : "sign photo"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              or click to browse ·{" "}
              {kind === "video" ? "MP4, MOV, WebM" : "JPG, PNG, WEBP"}
            </p>
          </div>
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black">
            {kind === "video" ? (
              <video
                src={previewUrl ?? undefined}
                controls
                className="w-full aspect-video object-contain bg-black"
              />
            ) : (
              <img
                src={previewUrl ?? undefined}
                alt="Upload preview"
                className="w-full aspect-video object-contain bg-black"
              />
            )}
            <button
              onClick={() => setFile(null)}
              aria-label="Remove upload"
              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/70 backdrop-blur text-white grid place-items-center hover:bg-black/90 focus-ring"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <div className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur text-[11px] text-white">
              {kind === "video" ? (
                <Film className="h-3 w-3" aria-hidden />
              ) : (
                <ImageIcon className="h-3 w-3" aria-hidden />
              )}
              {file.name}
            </div>
          </div>
          <button
            onClick={handleAnalyze}
            className={cn(
              "self-end inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold font-space-grotesk",
              "bg-gradient-to-r from-[#8B5CF6] to-[#C05177] text-white",
              "shadow-[0_6px_20px_rgba(139,92,246,0.4)]",
              "transition-all focus-ring",
              "hover:shadow-[0_8px_28px_rgba(192,81,119,0.5)] active:scale-95",
            )}
          >
            <Volume2 className="h-4 w-4" aria-hidden />
            Analyze & Speak
          </button>
        </div>
      )}
    </section>
  );
}

function OutputSection() {
  const recognized = useSimulatorStore((s) => s.recognized);
  const confidence = useSimulatorStore((s) => s.recognizedConfidence);
  const ttsHistory = useSimulatorStore((s) => s.ttsHistory);

  return (
    <div className="flex flex-col gap-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
      <section
        aria-label="Recognized speech"
        className="rounded-xl bg-zinc-950/60 border border-white/5 p-4 space-y-3"
      >
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
            Recognized
          </span>
          <span className="font-mono text-zinc-500">
            {Math.round(confidence * 100)}%
          </span>
        </div>
        <Progress
          value={confidence}
          color={confidence >= 0.75 ? "emerald" : "amber"}
        />
        <p className="text-base font-medium min-h-[1.5em] font-inter">
          {recognized || (
            <span className="text-zinc-500 italic font-normal">
              Sign to see the recognised sentence here.
            </span>
          )}
        </p>
      </section>

      <section aria-label="Spoken utterance history">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2 font-space-grotesk">
          Voice History
        </p>
        <div className="rounded-xl bg-zinc-950/60 border border-white/5 divide-y divide-white/5 max-h-44 overflow-y-auto scrollbar-thin">
          {ttsHistory.length === 0 ? (
            <p className="p-4 text-xs text-zinc-500 italic font-inter">
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
                    className="h-4 w-4 mt-0.5 text-[#8B5CF6] shrink-0"
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0 font-inter">
                    <p className="text-sm truncate text-ink">{h.text}</p>
                    <p className="text-[11px] text-zinc-500">
                      {formatTime(h.timestampMs)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </section>
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
      aria-label={
        active
          ? "Stop sign-to-speech translation"
          : "Start sign-to-speech translation"
      }
      aria-pressed={active}
      className={cn(
        "relative h-20 w-20 rounded-full grid place-items-center transition-all p-4 focus-ring",
        active
          ? "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_12px_40px_rgba(139,92,246,0.55)]"
          : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-white/10 active:scale-95",
      )}
    >
      {active ? (
        <Camera className="h-8 w-8" aria-hidden strokeWidth={2.2} />
      ) : (
        <CameraOff className="h-8 w-8" aria-hidden strokeWidth={2.2} />
      )}
      {active && (
        <>
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-[#8B5CF6]/70 animate-pulse-ring"
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border border-[#C05177]/50 scale-110"
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
