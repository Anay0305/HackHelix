import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Sparkles,
  Send,
  UploadCloud,
  Film,
  X,
  Type,
  Video,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { useSimulatorStore } from "@/store/simulatorStore";
import { useMicCapture } from "../hooks/useMicCapture";
import { getSocket } from "@/api/socket";
import { shortId } from "@/lib/format";
import { AvatarStage } from "./avatar/AvatarStage";

type InputMode = "text" | "voice" | "media";

const sentimentVariants: Record<
  string,
  "success" | "muted" | "danger" | "info"
> = {
  happy: "success",
  neutral: "muted",
  urgent: "danger",
  sad: "info",
};

export function SpeechToIslPanel() {
  const [inputMode, setInputMode] = useState<InputMode>("voice");

  return (
    <div className="flex flex-col gap-5 h-full">
      <ModeToggle value={inputMode} onChange={setInputMode} />

      <div className="flex-1 min-h-0 flex flex-col gap-5">
        {inputMode === "text" && <TextMode />}
        {inputMode === "voice" && <VoiceMode />}
        {inputMode === "media" && <MediaMode />}

        <div className="h-64 md:h-72 shrink-0" aria-label="Avatar output stage">
          <AvatarStage />
        </div>

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
        value: "text",
        label: "Text input",
        icon: <Type className="h-6 w-6" strokeWidth={2.2} aria-hidden />,
      },
      {
        value: "voice",
        label: "Voice input",
        icon: <Mic className="h-6 w-6" strokeWidth={2.2} aria-hidden />,
      },
      {
        value: "media",
        label: "Video or photo input",
        icon: <Video className="h-6 w-6" strokeWidth={2.2} aria-hidden />,
      },
    ];

  return (
    <div
      role="tablist"
      aria-label="English input mode"
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

function TextMode() {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const setSessionId = useSimulatorStore((s) => s.setSessionId);

  function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    const id = `sess-${shortId()}`;
    setSessionId(id);
    getSocket().send({
      type: "start",
      mode: "speech2isl",
      sessionId: id,
    });
    getSocket().send({
      type: "text",
      mode: "speech2isl",
      sessionId: id,
      payload: text.trim(),
    } as never);
    setTimeout(() => setSending(false), 400);
  }

  return (
    <section
      aria-label="Text input"
      className="flex flex-col gap-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 font-inter"
    >
      <label
        htmlFor="text-input"
        className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk"
      >
        Type in English
      </label>
      <textarea
        id="text-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
        }}
        placeholder="Type a sentence to translate into ISL…"
        rows={5}
        className={cn(
          "w-full resize-none rounded-xl bg-zinc-950/60 border border-white/10 px-4 py-3",
          "text-sm text-ink placeholder:text-zinc-500",
          "focus:outline-none focus:border-[#8B5CF6]/60 focus:ring-2 focus:ring-[#8B5CF6]/25",
          "transition-all",
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500 font-inter">
          {text.length} chars · ⌘/Ctrl + Enter to send
        </span>
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          aria-label="Send text for translation"
          className={cn(
            "inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold font-space-grotesk",
            "bg-gradient-to-r from-[#8B5CF6] to-[#C05177] text-white",
            "shadow-[0_6px_20px_rgba(139,92,246,0.4)]",
            "transition-all focus-ring",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "hover:shadow-[0_8px_28px_rgba(192,81,119,0.5)] active:scale-95",
          )}
        >
          <Send className="h-4 w-4" aria-hidden />
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </section>
  );
}

function VoiceMode() {
  const mic = useMicCapture();
  const isLive = useSimulatorStore((s) => s.isLive);
  const setIsLive = useSimulatorStore((s) => s.setIsLive);
  const setSessionId = useSimulatorStore((s) => s.setSessionId);
  const sessionId = useSimulatorStore((s) => s.sessionId);

  useEffect(() => {
    return () => {
      if (isLive) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    await mic.start();
    const id = `sess-${shortId()}`;
    setSessionId(id);
    setIsLive(true);
    getSocket().send({ type: "start", mode: "speech2isl", sessionId: id });
  }

  function stop() {
    mic.stop();
    getSocket().send({ type: "stop" });
    setIsLive(false);
    setSessionId(null);
  }

  return (
    <section
      aria-label="Voice input"
      className="flex flex-col items-center gap-5 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6"
    >
      <MicButton
        isLive={isLive}
        level={mic.level}
        onClick={isLive ? stop : start}
      />
      {sessionId && (
        <p className="text-[11px] font-mono text-zinc-500">{sessionId}</p>
      )}
      <Waveform level={mic.level} active={isLive} />
      {mic.error && (
        <p role="alert" className="text-xs text-[#C05177] font-inter">
          Microphone: {mic.error}
        </p>
      )}
    </section>
  );
}

function MediaMode() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!f.type.startsWith("video/") && !f.type.startsWith("image/")) return;
    setFile(f);
  }

  const isVideo = file?.type.startsWith("video/");

  return (
    <section
      aria-label="Video or photo upload"
      className="flex flex-col gap-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 font-inter"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
        Upload Video or Photo
      </p>

      {!file ? (
        <label
          htmlFor="media-upload"
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
            ref={inputRef}
            id="media-upload"
            type="file"
            accept="video/*,image/*"
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
              Drop a video or photo
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              or click to browse · MP4, MOV, JPG, PNG
            </p>
          </div>
        </label>
      ) : (
        <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black">
          {isVideo ? (
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
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur text-[11px] text-white font-inter">
            <Film className="h-3 w-3" aria-hidden />
            {file.name}
          </div>
        </div>
      )}
    </section>
  );
}

function OutputSection() {
  const transcripts = useSimulatorStore((s) => s.transcripts);
  const glossTokens = useSimulatorStore((s) => s.glossTokens);
  const sourceText = useSimulatorStore((s) => s.sourceText);
  const sentiment = useSimulatorStore((s) => s.sentiment);
  const latest = transcripts[transcripts.length - 1];

  return (
    <div className="flex flex-col gap-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5">
      <section aria-label="Live transcript" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
            Transcript
          </p>
          {latest && (
            <Badge variant="info">
              {Math.round((latest.confidence ?? 0) * 100)}% conf
            </Badge>
          )}
        </div>
        <div className="min-h-[52px] rounded-xl bg-zinc-950/60 border border-white/5 px-4 py-3 text-sm font-inter">
          <AnimatePresence mode="wait">
            {latest ? (
              <motion.p
                key={latest.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-ink"
              >
                {latest.text}
                {latest.partial && (
                  <span className="animate-pulse text-[#8B5CF6]">…</span>
                )}
              </motion.p>
            ) : (
              <p className="text-zinc-500 italic">
                Your speech or text appears here.
              </p>
            )}
          </AnimatePresence>
        </div>
      </section>

      <section aria-label="ISL gloss tokens" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
            ISL Gloss · SOV reorder
          </p>
          {sentiment !== "neutral" && (
            <Badge
              variant={sentimentVariants[sentiment] ?? "muted"}
              className="capitalize"
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              {sentiment}
            </Badge>
          )}
        </div>
        <div className="min-h-[72px] rounded-xl bg-zinc-950/60 border border-[#8B5CF6]/20 px-4 py-3">
          {glossTokens.length === 0 ? (
            <p className="text-zinc-500 italic text-sm font-inter">
              Gloss tokens animate the avatar in order.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {glossTokens.map((t, i) => (
                <motion.span
                  key={`${t.gloss}-${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-[#8B5CF6]/25 to-[#C05177]/25 border border-[#8B5CF6]/30 font-mono text-xs font-medium text-ink"
                >
                  {t.gloss}
                </motion.span>
              ))}
            </div>
          )}
        </div>
        {sourceText && (
          <p className="text-xs text-zinc-500 italic font-inter">
            &ldquo;{sourceText}&rdquo;
          </p>
        )}
      </section>
    </div>
  );
}

function MicButton({
  isLive,
  level,
  onClick,
}: {
  isLive: boolean;
  level: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={
        isLive
          ? "Stop speech-to-sign translation"
          : "Start speech-to-sign translation"
      }
      aria-pressed={isLive}
      className={cn(
        "relative h-24 w-24 rounded-full grid place-items-center transition-all p-4 focus-ring",
        isLive
          ? "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_12px_40px_rgba(139,92,246,0.55)]"
          : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-white/10 active:scale-95",
      )}
    >
      {isLive ? (
        <Mic className="h-9 w-9" aria-hidden strokeWidth={2.2} />
      ) : (
        <MicOff className="h-9 w-9" aria-hidden strokeWidth={2.2} />
      )}
      {isLive && (
        <>
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-[#8B5CF6]/70 animate-pulse-ring"
            style={{ transform: `scale(${1 + level * 0.6})` }}
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border border-[#C05177]/50"
            style={{ transform: `scale(${1.2 + level * 0.4})` }}
          />
        </>
      )}
    </button>
  );
}

function Waveform({ level, active }: { level: number; active: boolean }) {
  const bars = 32;
  return (
    <div
      aria-hidden
      className="flex w-full items-end justify-between gap-[3px] h-12 px-2 rounded-lg bg-zinc-950/60 border border-white/5"
    >
      {Array.from({ length: bars }).map((_, i) => {
        const phase = (Math.sin(Date.now() / 200 + i) + 1) / 2;
        const h = active
          ? Math.max(0.15, Math.min(1, level * (0.5 + phase * 1.2)))
          : 0.1;
        return (
          <span
            key={i}
            className={cn(
              "w-1 rounded-full transition-all duration-100",
              active
                ? "bg-gradient-to-t from-[#8B5CF6] to-[#C05177]"
                : "bg-white/10",
            )}
            style={{ height: `${h * 100}%` }}
          />
        );
      })}
    </div>
  );
}
