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

// Shared snapshot of the last MediaPipe result so <LandmarkOverlay /> can
// draw the ACTUAL detected landmarks instead of decorative noise.
export interface LandmarkSnapshot {
  hasHand: boolean;
  pose:      Array<{ x: number; y: number }>;   // 33 landmarks
  rightHand: Array<{ x: number; y: number }>;   // 21 landmarks
  leftHand:  Array<{ x: number; y: number }>;   // 21 landmarks
  updatedAt: number;
}

const EMPTY_SNAPSHOT: LandmarkSnapshot = {
  hasHand: false,
  pose: [],
  rightHand: [],
  leftHand: [],
  updatedAt: 0,
};

// Module-level singleton so any consumer can subscribe without prop drilling.
let _snapshot: LandmarkSnapshot = EMPTY_SNAPSHOT;
const _subs = new Set<(s: LandmarkSnapshot) => void>();

export function getLandmarkSnapshot(): LandmarkSnapshot {
  return _snapshot;
}

export function subscribeLandmarks(cb: (s: LandmarkSnapshot) => void): () => void {
  _subs.add(cb);
  cb(_snapshot);
  return () => { _subs.delete(cb); };
}

function publishLandmarks(next: LandmarkSnapshot) {
  _snapshot = next;
  _subs.forEach((cb) => cb(next));
}

function toXY(lms: { x: number; y: number }[] | undefined | null) {
  return (lms ?? []).map((l) => ({ x: l.x, y: l.y }));
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

      // MediaPipe's WASM emits stderr via emscripten _fd_write which browsers
      // route to console.error. The messages are informational (TFLite
      // delegate, XNNPACK init). Filter them so the real console stays useful.
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        const stack = new Error().stack ?? "";
        if (stack.includes("holistic_solution_") || stack.includes("_fd_write")) {
          return;
        }
        origError.apply(console, args as []);
      };

      const holistic = new Holistic({ locateFile });
      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        refineFaceLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      let lastDebugLog = 0;
      holistic.onResults((results: Results) => {
        const frame = {
          pose:      flattenLandmarks(results.poseLandmarks),
          leftHand:  flattenLandmarks(results.leftHandLandmarks),
          rightHand: flattenLandmarks(results.rightHandLandmarks),
          face:      flattenLandmarks(results.faceLandmarks),
        };
        const hasHand = frame.leftHand.length > 0 || frame.rightHand.length > 0;

        // Publish real landmarks for the overlay
        publishLandmarks({
          hasHand,
          pose:      toXY(results.poseLandmarks as never),
          rightHand: toXY(results.rightHandLandmarks as never),
          leftHand:  toXY(results.leftHandLandmarks as never),
          updatedAt: performance.now(),
        });

        const now = performance.now();
        if (now - lastDebugLog > 1000) {
          lastDebugLog = now;
          // eslint-disable-next-line no-console
          console.info("[webcam] onResults", {
            hasHand,
            rightHand: frame.rightHand.length / 3,
            leftHand: frame.leftHand.length / 3,
            face: frame.face.length / 3,
          });
        }
        if (hasHand) {
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
    publishLandmarks(EMPTY_SNAPSHOT);
    setState({ isActive: false, error: null });
  }

  useEffect(() => () => stop(), []);

  return { videoRef, ...state, start, stop };
}
