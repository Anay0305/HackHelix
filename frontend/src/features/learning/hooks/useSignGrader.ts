/**
 * useSignGrader — wraps useWebcamCapture and calls /isl/grade at ~5 fps.
 *
 * Returns live per-finger scores so HandOverlay can colour the skeleton,
 * plus a `sustained` flag that fires when score ≥ 65 for 1.5 consecutive seconds.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebcamCapture } from "@/features/simulator/hooks/useWebcamCapture";
import { env } from "@/lib/env";

interface GradeResult {
  score: number;
  fingerScores: Record<string, number>;
  pass: boolean;
}

interface State {
  score: number;
  fingerScores: Record<string, number>;
  sustained: boolean;   // true when score ≥ 65 held for 1.5s
  landmarks: Array<{ x: number; y: number; z?: number }> | null;
}

const PASS_THRESHOLD = 65;
const SUSTAIN_MS = 1500;
const GRADE_INTERVAL_MS = 200;  // ~5 fps

export function useSignGrader(signId: string | undefined) {
  const webcam = useWebcamCapture();
  const [state, setState] = useState<State>({
    score: 0,
    fingerScores: {},
    sustained: false,
    landmarks: null,
  });

  const aboveThresholdSince = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestFrameRef = useRef<Record<string, number[]>>({});

  // Intercept MediaPipe results to grab the raw landmark array
  // We monkey-patch the webcam's internal socket.send to also update our frame ref.
  // Simpler: we expose a landmark feed via the webcam's onResults side-channel.
  // For now we'll read the last frame from the webcam's internal store.

  const grade = useCallback(async () => {
    if (!signId) return;
    const frame = latestFrameRef.current;
    const flat = frame.rightHand || frame.leftHand;
    if (!flat || flat.length < 63) return;

    // Unflatten flat array [x0,y0,z0, x1,y1,z1, ...] to [{x,y,z}×21]
    const userHand = [];
    for (let i = 0; i < 21; i++) {
      userHand.push({ x: flat[i * 3], y: flat[i * 3 + 1], z: flat[i * 3 + 2] ?? 0 });
    }

    try {
      const res = await fetch(`${env.backendUrl}/isl/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sign: signId, userHand }),
      });
      if (!res.ok) return;
      const data: GradeResult = await res.json();

      const passing = data.score >= PASS_THRESHOLD;
      const now = performance.now();
      if (passing) {
        if (aboveThresholdSince.current === null) aboveThresholdSince.current = now;
        const sustained = now - aboveThresholdSince.current >= SUSTAIN_MS;
        setState((s) => ({
          ...s,
          score: data.score,
          fingerScores: data.fingerScores,
          sustained,
        }));
      } else {
        aboveThresholdSince.current = null;
        setState((s) => ({
          ...s,
          score: data.score,
          fingerScores: data.fingerScores,
          sustained: false,
        }));
      }

      // Update landmarks for overlay
      const rightFlat: number[] = frame.rightHand || frame.leftHand;
      if (rightFlat && rightFlat.length >= 63) {
        const lms: Array<{ x: number; y: number; z: number }> = [];
        for (let i = 0; i < 21; i++) {
          lms.push({ x: rightFlat[i * 3], y: rightFlat[i * 3 + 1], z: rightFlat[i * 3 + 2] ?? 0 });
        }
        setState((s) => ({ ...s, landmarks: lms }));
      }
    } catch {
      // silent — backend may be briefly unavailable
    }
  }, [signId]);

  // Start grading loop when webcam is active
  useEffect(() => {
    if (!webcam.isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(grade, GRADE_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [webcam.isActive, grade]);

  // Expose a way to update the latest frame (called from webcam socket send hook)
  // We read from the webcam's last frame via a custom event
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      latestFrameRef.current = e.detail.frame ?? {};
    };
    window.addEventListener("mediapipe-frame" as string, handler as EventListener);
    return () => window.removeEventListener("mediapipe-frame" as string, handler as EventListener);
  }, []);

  const start = useCallback(() => {
    aboveThresholdSince.current = null;
    setState({ score: 0, fingerScores: {}, sustained: false, landmarks: null });
    webcam.start();
  }, [webcam]);

  const stop = useCallback(() => {
    webcam.stop();
    setState({ score: 0, fingerScores: {}, sustained: false, landmarks: null });
  }, [webcam]);

  return {
    ...state,
    isActive: webcam.isActive,
    error: webcam.error,
    videoRef: webcam.videoRef,
    start,
    stop,
  };
}
