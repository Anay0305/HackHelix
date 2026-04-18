import { useEffect, useRef, useState } from "react";

interface State {
  isRecording: boolean;
  level: number; // 0..1
  error: string | null;
}

/**
 * Microphone capture with an AnalyserNode for level/waveform.
 * In mock mode, real audio chunks are NOT sent \u2014 the mock socket
 * produces canned transcripts on `start`.
 */
export function useMicCapture() {
  const [state, setState] = useState<State>({
    isRecording: false,
    level: 0,
    error: null,
  });
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        // RMS of deviation from 128
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setState((s) => ({ ...s, level: Math.min(1, rms * 4) }));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      setState({ isRecording: true, level: 0, error: null });
    } catch (e: any) {
      setState({ isRecording: false, level: 0, error: e?.message ?? "Mic denied" });
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    ctxRef.current = null;
    analyserRef.current = null;
    setState({ isRecording: false, level: 0, error: null });
  }

  useEffect(() => () => stop(), []);

  return { ...state, start, stop };
}
