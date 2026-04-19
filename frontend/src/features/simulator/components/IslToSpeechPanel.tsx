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
  Bell,
  Send,
  Keyboard,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Progress } from "@/components/ui/Progress";
import { useSimulatorStore } from "@/store/simulatorStore";
import { useWebcamCapture, subscribeLandmarks, type LandmarkSnapshot } from "../hooks/useWebcamCapture";
import { getSocket } from "@/api/socket";
import { shortId, formatTime } from "@/lib/format";
import { ISLCameraInput } from "./ISLCameraInput";

type InputMode = "live" | "video" | "photo" | "gloss";

const ALERT_ICONS: Record<string, string> = {
  fire_alarm: "🔥",
  doorbell:   "🔔",
  horn:       "📯",
  siren:      "🚨",
  phone:      "📞",
  alarm:      "⚠️",
  bell:       "🔔",
};

function AlertBanner() {
  const alert = useSimulatorStore((s) => s.alert);
  if (!alert) return null;

  return (
    <motion.div
      key={alert.seenAt}
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40"
      role="alert"
    >
      <Bell className="h-5 w-5 text-amber-400 shrink-0" aria-hidden />
      <span className="text-xl" aria-hidden>{ALERT_ICONS[alert.alertType] ?? "⚠️"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-200 font-space-grotesk capitalize">
          {alert.alertType.replace("_", " ")} detected
        </p>
        <p className="text-[11px] text-amber-400/80 font-inter">
          {alert.label} · {Math.round(alert.confidence * 100)}% confidence
        </p>
      </div>
    </motion.div>
  );
}

export function IslToSpeechPanel() {
  const [inputMode, setInputMode] = useState<InputMode>("live");

  return (
    <div className="flex flex-col gap-5 h-full">
      <ModeToggle value={inputMode} onChange={setInputMode} />

      <AnimatePresence>
        <AlertBanner />
      </AnimatePresence>

      <div className="flex-1 min-h-0 flex flex-col gap-5">
        {inputMode === "live"  && <LiveCameraMode />}
        {inputMode === "video" && <UploadMode accept="video/*" kind="video" />}
        {inputMode === "photo" && <UploadMode accept="image/*" kind="photo" />}
        {inputMode === "gloss" && <GlossTextMode />}
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
      {
        value: "gloss",
        label: "Type Gloss",
        icon: <Keyboard className="h-6 w-6" strokeWidth={2.2} aria-hidden />,
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

// Phase-13: MediaPipe Holistic runs in-browser, streams landmarks to backend.
// The old useWebcamCapture path is kept in the imports for LandmarkOverlay
// downstream but no longer drives this tab.
function LiveCameraMode() {
  return <ISLCameraInput />;
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

function GlossTextMode() {
  const [gloss, setGloss] = useState("");
  const [busy, setBusy] = useState(false);
  const setSessionId = useSimulatorStore((s) => s.setSessionId);

  const QUICK: string[] = [
    "ME WATER WANT",
    "ME HELP NEED",
    "YOU NAME WHAT",
    "ME UNDERSTAND NOT",
    "YOU OKAY",
    "ME THANK_YOU",
    "ME DOCTOR NEED",
  ];

  async function submit(text: string) {
    const g = text.trim().toUpperCase();
    if (!g) return;
    setBusy(true);
    const id = `sess-${shortId()}`;
    setSessionId(id);
    getSocket().send({ type: "start", mode: "isl2speech", sessionId: id });
    // Reuse the backend's text→gloss→TTS path by sending as landmarks flush
    // via a special "gloss_text" message type the backend handles
    getSocket().send({ type: "gloss_text", payload: g, sessionId: id } as never);
    setTimeout(() => setBusy(false), 3000);
  }

  return (
    <section
      aria-label="Type ISL gloss"
      className="flex flex-col gap-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
        Type ISL Gloss → Speech
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={gloss}
          onChange={(e) => setGloss(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { submit(gloss); setGloss(""); } }}
          placeholder="ME WATER WANT"
          className={cn(
            "flex-1 bg-zinc-950/70 border border-white/10 rounded-xl px-4 py-2.5",
            "text-sm font-mono text-white placeholder:text-zinc-600",
            "focus:outline-none focus:border-[#8B5CF6]/60 transition-colors",
          )}
        />
        <button
          onClick={() => { submit(gloss); setGloss(""); }}
          disabled={busy || !gloss.trim()}
          aria-label="Convert gloss to speech"
          className={cn(
            "h-10 w-10 rounded-xl grid place-items-center transition-all focus-ring",
            "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "hover:shadow-[0_4px_16px_rgba(139,92,246,0.5)] active:scale-95",
          )}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => submit(q)}
            disabled={busy}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all",
              "bg-white/5 border border-white/10 text-zinc-400",
              "hover:bg-[#8B5CF6]/20 hover:border-[#8B5CF6]/40 hover:text-white",
              "disabled:opacity-40 disabled:cursor-not-allowed active:scale-95",
            )}
          >
            {q}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-zinc-600 font-inter">
        ISL gloss order: SOV · e.g. ME WATER WANT = "I want water"
      </p>
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

// MediaPipe Hand connection pairs — for drawing skeleton lines between joints
const HAND_EDGES: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],         // thumb
  [0,5],[5,6],[6,7],[7,8],         // index
  [5,9],[9,10],[10,11],[11,12],    // middle
  [9,13],[13,14],[14,15],[15,16],  // ring
  [13,17],[17,18],[18,19],[19,20], // pinky
  [0,17],                           // palm base
];

function LandmarkOverlay() {
  const [snap, setSnap] = useState<LandmarkSnapshot | null>(null);
  // Staleness flag: if we haven't seen a MediaPipe tick in 1.5 s, "detecting…"
  const [stale, setStale] = useState(true);

  useEffect(() => {
    const unsub = subscribeLandmarks(setSnap);
    const id = setInterval(() => {
      const s = snap;
      if (!s) return;
      setStale(performance.now() - s.updatedAt > 1500);
    }, 300);
    return () => {
      unsub();
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasHand = !!snap?.hasHand && !stale;
  // Video is mirrored with scaleX(-1) in the panel — undo that here so the
  // overlay aligns with what the user actually sees.
  const toPct = (v: number) => `${v * 100}%`;
  const mirrorX = (x: number) => 1 - x;   // because the video element is flipped

  return (
    <>
      {/* HUD status badge — top-left */}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "absolute top-2 left-2 z-10 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium backdrop-blur",
          hasHand
            ? "bg-emerald-500/20 border border-emerald-400/40 text-emerald-200"
            : "bg-zinc-900/70 border border-white/10 text-zinc-400",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            hasHand ? "bg-emerald-400 animate-pulse" : "bg-zinc-600",
          )}
          aria-hidden
        />
        {hasHand ? "Hand detected" : stale ? "No video" : "No hand in frame"}
      </div>

      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      >
        {/* Right-hand skeleton + joints (purple) */}
        {snap?.rightHand.length === 21 && (
          <g>
            {HAND_EDGES.map(([a, b], i) => (
              <line
                key={`rE${i}`}
                x1={toPct(mirrorX(snap.rightHand[a].x))}
                y1={toPct(snap.rightHand[a].y)}
                x2={toPct(mirrorX(snap.rightHand[b].x))}
                y2={toPct(snap.rightHand[b].y)}
                stroke="#8B5CF6"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.9"
              />
            ))}
            {snap.rightHand.map((p, i) => (
              <circle
                key={`rD${i}`}
                cx={toPct(mirrorX(p.x))}
                cy={toPct(p.y)}
                r={i === 0 || [4, 8, 12, 16, 20].includes(i) ? 4 : 3}
                fill="#C4B5FD"
                stroke="#8B5CF6"
                strokeWidth="1.5"
              />
            ))}
          </g>
        )}

        {/* Left-hand skeleton + joints (rose) */}
        {snap?.leftHand.length === 21 && (
          <g>
            {HAND_EDGES.map(([a, b], i) => (
              <line
                key={`lE${i}`}
                x1={toPct(mirrorX(snap.leftHand[a].x))}
                y1={toPct(snap.leftHand[a].y)}
                x2={toPct(mirrorX(snap.leftHand[b].x))}
                y2={toPct(snap.leftHand[b].y)}
                stroke="#C05177"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.9"
              />
            ))}
            {snap.leftHand.map((p, i) => (
              <circle
                key={`lD${i}`}
                cx={toPct(mirrorX(p.x))}
                cy={toPct(p.y)}
                r={i === 0 || [4, 8, 12, 16, 20].includes(i) ? 4 : 3}
                fill="#FBCFE8"
                stroke="#C05177"
                strokeWidth="1.5"
              />
            ))}
          </g>
        )}

        {/* Pose shoulders/elbows/wrists (teal) — handy for framing */}
        {snap?.pose.length === 33 && (
          <g opacity="0.55">
            {[11, 12, 13, 14, 15, 16].map((i) => (
              <circle
                key={`p${i}`}
                cx={toPct(mirrorX(snap.pose[i].x))}
                cy={toPct(snap.pose[i].y)}
                r="3"
                fill="#22D3EE"
              />
            ))}
          </g>
        )}
      </svg>
    </>
  );
}
