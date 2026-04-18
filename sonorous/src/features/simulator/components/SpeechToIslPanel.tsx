import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { useSimulatorStore } from "@/store/simulatorStore";
import { useMicCapture } from "../hooks/useMicCapture";
import { getSocket } from "@/api/socket";
import { shortId } from "@/lib/format";

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
  const mic = useMicCapture();
  const isLive = useSimulatorStore((s) => s.isLive);
  const setIsLive = useSimulatorStore((s) => s.setIsLive);
  const transcripts = useSimulatorStore((s) => s.transcripts);
  const glossTokens = useSimulatorStore((s) => s.glossTokens);
  const sourceText = useSimulatorStore((s) => s.sourceText);
  const sentiment = useSimulatorStore((s) => s.sentiment);
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

  const latest = transcripts[transcripts.length - 1];

  return (
    <div className="flex flex-col gap-6 h-full text-ink">
      {/* Mic button — icon-first, no descriptive text row */}
      <div className="flex items-center justify-center">
        <MicButton
          isLive={isLive}
          level={mic.level}
          onClick={isLive ? stop : start}
        />
      </div>

      {sessionId && (
        <p className="text-center text-[11px] font-mono text-muted -mt-2">
          {sessionId}
        </p>
      )}

      {/* Waveform */}
      <Waveform level={mic.level} active={isLive} />

      {/* Transcript */}
      <section aria-label="Live transcript" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Transcript
          </p>
          {latest && (
            <Badge variant="info">
              {Math.round((latest.confidence ?? 0) * 100)}% conf
            </Badge>
          )}
        </div>
        <div className="min-h-[60px] rounded-lg glass px-4 py-3 text-sm leading-relaxed">
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
                  <span className="animate-pulse text-brand-purple">…</span>
                )}
              </motion.p>
            ) : (
              <p className="text-muted italic">
                Your speech appears here as you talk.
              </p>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Gloss tokens */}
      <section aria-label="ISL gloss tokens" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
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
        <div className="min-h-[84px] rounded-lg glass px-4 py-3 border-brand-purple/20">
          {glossTokens.length === 0 ? (
            <p className="text-muted italic text-sm">
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
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-brand-soft border border-brand-purple/30 font-mono text-xs font-medium text-ink"
                >
                  {t.gloss}
                </motion.span>
              ))}
            </div>
          )}
        </div>
        {sourceText && (
          <p className="text-xs text-muted italic">
            &ldquo;{sourceText}&rdquo;
          </p>
        )}
      </section>

      {mic.error && (
        <p
          role="alert"
          className="text-xs text-brand-rose"
        >
          Microphone: {mic.error}
        </p>
      )}
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
          ? "bg-brand-primary text-white shadow-[0_12px_40px_rgba(139,92,246,0.55)]"
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
            className="absolute inset-0 rounded-full border-2 border-brand-primary/70 animate-pulse-ring"
            style={{ transform: `scale(${1 + level * 0.6})` }}
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border border-brand-tertiary/50"
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
      className="flex items-end justify-between gap-[3px] h-12 px-2 rounded-lg glass"
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
                ? "bg-gradient-to-t from-brand-purple to-brand-rose"
                : "bg-white/10",
            )}
            style={{ height: `${h * 100}%` }}
          />
        );
      })}
    </div>
  );
}
