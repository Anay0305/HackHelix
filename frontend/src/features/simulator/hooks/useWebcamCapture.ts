import { useEffect, useRef, useState } from "react";
import type { Results } from "@mediapipe/holistic";
import { getSocket } from "@/api/socket";

interface State {
  isActive: boolean;
  error: string | null;
}

// MediaPipe CDN — model files downloaded on first use
const MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629";

function locateFile(file: string) {
  return `${MEDIAPIPE_CDN}/${file}`;
}

function flattenLandmarks(lms: Results["poseLandmarks"] | null | undefined): number[] {
  if (!lms) return [];
  return lms.flatMap((l) => [l.x, l.y, l.z]);
}

export function useWebcamCapture() {
  const videoRef   = useRef<HTMLVideoElement | null>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const holisticRef = useRef<InstanceType<typeof import("@mediapipe/holistic").Holistic> | null>(null);
  const rafRef     = useRef<number | null>(null);
  const seqRef     = useRef(0);
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

      // Lazy-load MediaPipe Holistic
      const { Holistic } = await import("@mediapipe/holistic");

      const holistic = new Holistic({ locateFile });
      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        refineFaceLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      holistic.onResults((results: Results) => {
        const frame = {
          pose:      flattenLandmarks(results.poseLandmarks),
          leftHand:  flattenLandmarks(results.leftHandLandmarks),
          rightHand: flattenLandmarks(results.rightHandLandmarks),
          face:      flattenLandmarks(results.faceLandmarks),
        };
        // Only send if we have at least one hand detected
        if (frame.leftHand.length > 0 || frame.rightHand.length > 0) {
          getSocket().send({ type: "landmarks", seq: seqRef.current++, frame });
        }
      });

      holisticRef.current = holistic;
      seqRef.current = 0;

      // Feed frames at 15 fps to stay within MediaPipe processing speed
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

      setState({ isActive: true, error: null });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Camera denied";
      setState({ isActive: false, error: msg });
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    holisticRef.current?.close();
    holisticRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState({ isActive: false, error: null });
  }

  useEffect(() => () => stop(), []);

  return { videoRef, ...state, start, stop };
}
