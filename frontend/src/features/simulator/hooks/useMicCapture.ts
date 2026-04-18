import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/api/socket";

interface State {
  isRecording: boolean;
  level: number; // 0..1
  sampleRate: number;
  error: string | null;
}

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

export function useMicCapture() {
  const [state, setState] = useState<State>({
    isRecording: false,
    level: 0,
    sampleRate: 48000,
    error: null,
  });

  const streamRef    = useRef<MediaStream | null>(null);
  const ctxRef       = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const rafRef       = useRef<number | null>(null);
  const seqRef       = useRef(0);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const sr = ctx.sampleRate;

      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // PCM16 streaming via ScriptProcessor (4096 samples ≈ 85 ms at 48 kHz)
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      seqRef.current = 0;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(input);
        const b64   = uint8ToBase64(new Uint8Array(pcm16.buffer));
        getSocket().send({ type: "audio_chunk", seq: seqRef.current++, pcm16Base64: b64 });
      };

      source.connect(processor);
      // Must connect to destination to keep ScriptProcessor alive in Chrome
      processor.connect(ctx.destination);

      // Level visualisation loop
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        setState((s) => ({ ...s, level: Math.min(1, Math.sqrt(sum / buf.length) * 4) }));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setState({ isRecording: true, level: 0, sampleRate: sr, error: null });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Mic denied";
      setState({ isRecording: false, level: 0, sampleRate: 48000, error: msg });
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    ctxRef.current    = null;
    analyserRef.current = null;
    setState({ isRecording: false, level: 0, sampleRate: 48000, error: null });
  }

  useEffect(() => () => stop(), []);

  return { ...state, start, stop };
}
