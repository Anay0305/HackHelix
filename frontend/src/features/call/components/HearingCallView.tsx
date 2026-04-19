/**
 * Hearing person's in-call view.
 * - Mic → audio_chunk → call socket → (backend STT→ISL) → deaf person's avatar
 * - Receives TTS captions from deaf person's signs
 * - Shows ISL avatar preview (what deaf person sees)
 */
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { AvatarStage } from "@/features/simulator/components/avatar/AvatarStage";
import { useSimulatorStore } from "@/store/simulatorStore";
import type { CallSocket } from "../hooks/useCallSocket";

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

export function HearingCallView({ socket }: { socket: CallSocket }) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel]         = useState(0);
  const [micError, setMicError]   = useState<string | null>(null);
  const seqRef       = useRef(0);
  const streamRef    = useRef<MediaStream | null>(null);
  const ctxRef       = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const rafRef       = useRef<number | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);

  const transcripts = useSimulatorStore((s) => s.transcripts);
  const ttsHistory  = useSimulatorStore((s) => s.ttsHistory);
  const glossTokens = useSimulatorStore((s) => s.glossTokens);

  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;

      const ctx      = new AudioContext();
      ctxRef.current = ctx;
      const sr       = ctx.sampleRate;

      socket.send({ type: "start", mode: "speech2isl", sessionId: "call", sampleRate: sr });

      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(input);
        const b64   = uint8ToBase64(new Uint8Array(pcm16.buffer));
        socket.send({ type: "audio_chunk", seq: seqRef.current++, pcm16Base64: b64 });
      };
      source.connect(processor);
      processor.connect(ctx.destination);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setRecording(true);
      setMicError(null);
    } catch (e: unknown) {
      setMicError(e instanceof Error ? e.message : "Mic denied");
    }
  }

  function stopMic() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    ctxRef.current    = null;
    analyserRef.current = null;
    setRecording(false);
    setLevel(0);
  }

  useEffect(() => () => stopMic(), []);

  const lastTranscript = transcripts[transcripts.length - 1];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Mic control */}
      <section className="flex flex-col gap-4 bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
            Your Microphone
          </p>
          {recording && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-inter">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={recording ? stopMic : startMic}
            aria-label={recording ? "Stop mic" : "Start mic"}
            className={cn(
              "h-16 w-16 rounded-full grid place-items-center transition-all flex-shrink-0",
              recording
                ? "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_8px_32px_rgba(139,92,246,0.5)]"
                : "bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white hover:bg-zinc-800",
            )}
          >
            {recording ? <Mic className="h-7 w-7" /> : <MicOff className="h-7 w-7" />}
          </button>

          {/* Level bar */}
          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#C05177] transition-all duration-75"
              style={{ width: `${level * 100}%` }}
            />
          </div>
        </div>

        {micError && (
          <p className="text-xs text-red-400 font-inter">{micError}</p>
        )}

        {/* Text fallback */}
        <TextFallback socket={socket} />

        {lastTranscript && (
          <p className="text-sm text-zinc-300 font-inter italic truncate">
            "{lastTranscript.text}"
          </p>
        )}

        {glossTokens.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {glossTokens.map((t, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[11px] font-mono font-semibold text-[#8B5CF6]"
              >
                {t.gloss}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Avatar preview */}
      <section className="flex-1 min-h-[200px] bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-4 pt-3 font-space-grotesk">
          ISL Preview (what deaf person sees)
        </p>
        <AvatarStage />
      </section>

      {/* Captions from deaf person */}
      <section className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-[#8B5CF6]" />
          Deaf person said
        </p>
        <div className="space-y-1.5 max-h-28 overflow-y-auto scrollbar-thin">
          {ttsHistory.length === 0 ? (
            <p className="text-xs text-zinc-600 italic font-inter">
              Signing from deaf side will appear here as text.
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

function TextFallback({ socket }: { socket: CallSocket }) {
  const [text, setText] = useState("");
  function send() {
    const t = text.trim();
    if (!t) return;
    socket.send({ type: "text", payload: t });
    setText("");
  }
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder="Or type your message…"
        className="flex-1 bg-zinc-950/70 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#8B5CF6]/60 transition-colors font-inter"
      />
      <button
        onClick={send}
        disabled={!text.trim()}
        className="px-3 py-2 rounded-xl text-sm bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[#8B5CF6] disabled:opacity-40 hover:bg-[#8B5CF6]/30 transition-all font-space-grotesk font-semibold"
      >
        Send
      </button>
    </div>
  );
}
