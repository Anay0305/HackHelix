import { useEffect, useRef, useState } from "react";

interface State {
  isActive: boolean;
  error: string | null;
}

export function useWebcamCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<State>({ isActive: false, error: null });

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState({ isActive: true, error: null });
    } catch (e: any) {
      setState({ isActive: false, error: e?.message ?? "Camera denied" });
    }
  }

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState({ isActive: false, error: null });
  }

  useEffect(() => () => stop(), []);

  return { videoRef, ...state, start, stop };
}
