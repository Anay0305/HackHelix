import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import {
  Holistic,
  POSE_CONNECTIONS,
  HAND_CONNECTIONS,
  type NormalizedLandmark,
  type Results,
} from "@mediapipe/holistic";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import { Camera, CameraOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { getSocket } from "@/api/socket";
import { shortId } from "@/lib/format";

/**
 * Phase-13/15 ISL → English client-side feature extractor with explicit
 * on/off control.
 *
 * Why client-side: uploading raw video over WS would eat bandwidth + add 200ms
 * of transcode latency. Instead we run Google's MediaPipe Holistic in the
 * browser, extract per-frame skeletal landmarks, and ship only the float
 * arrays. Backend classifies gesture → gloss → sentence on top.
 *
 * The camera starts OFF. The user taps the big gradient button to grant
 * permission, spin up Holistic, and start streaming landmarks. Tapping
 * again stops the stream, closes the graph, frees the webcam track, and
 * tells the backend to drop its pose-window buffer.
 */

const SEND_INTERVAL_MS = 50; // ~20 fps — comfortably inside the 15-30 fps spec
const PROCESS_INTERVAL_MS = 50;
const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic";

export function ISLCameraInput() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holisticRef = useRef<Holistic | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const lastProcessedRef = useRef(0);
  const sessionIdRef = useRef<string>("");

  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current;
    const video = webcamRef.current?.video as HTMLVideoElement | null | undefined;
    if (!canvas || !video) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    if (results.poseLandmarks) {
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: "#8B5CF6",
        lineWidth: 3,
      });
      drawLandmarks(ctx, results.poseLandmarks, {
        color: "#C05177",
        lineWidth: 1,
        radius: 3,
      });
    }
    if (results.leftHandLandmarks) {
      drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, {
        color: "#C05177",
        lineWidth: 2,
      });
      drawLandmarks(ctx, results.leftHandLandmarks, {
        color: "#ffffff",
        radius: 2,
      });
    }
    if (results.rightHandLandmarks) {
      drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, {
        color: "#8B5CF6",
        lineWidth: 2,
      });
      drawLandmarks(ctx, results.rightHandLandmarks, {
        color: "#ffffff",
        radius: 2,
      });
    }
    ctx.restore();

    const now = performance.now();
    if (now - lastSentRef.current < SEND_INTERVAL_MS) return;
    lastSentRef.current = now;

    const pose = flatten(results.poseLandmarks);
    const leftHand = flatten(results.leftHandLandmarks);
    const rightHand = flatten(results.rightHandLandmarks);

    if (pose.length === 0 && leftHand.length === 0 && rightHand.length === 0) {
      return;
    }

    const data = [...pose, ...leftHand, ...rightHand];

    getSocket().send({
      type: "landmarks",
      data,
      frame: { pose, leftHand, rightHand },
    } as never);
  }, []);

  // Spin up / tear down MediaPipe + backend session when `enabled` flips.
  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    const id = `sess-${shortId()}`;
    sessionIdRef.current = id;
    getSocket().send({
      type: "start",
      mode: "isl2speech",
      sessionId: id,
    } as never);

    const holistic = new Holistic({
      locateFile: (file) => `${CDN}/${file}`,
    });
    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      refineFaceLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    holistic.onResults(onResults);
    holisticRef.current = holistic;

    const tick = async () => {
      if (cancelled) return;
      const video = webcamRef.current?.video as HTMLVideoElement | null | undefined;

      if (video && video.readyState >= 2 && !video.paused && !video.ended) {
        const now = performance.now();
        if (now - lastProcessedRef.current >= PROCESS_INTERVAL_MS) {
          lastProcessedRef.current = now;
          try {
            await holistic.send({ image: video });
            if (!cancelled) setStatus("live");
          } catch (e) {
            console.warn("[ISLCameraInput] holistic.send failed:", e);
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      try {
        holistic.close();
      } catch {
        /* noop */
      }
      holisticRef.current = null;
      try {
        getSocket().send({ type: "stop" } as never);
      } catch {
        /* socket may already be closed */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const handleUserMediaError = useCallback(
    (err: string | DOMException) => {
      const msg = err instanceof DOMException ? err.message : String(err);
      console.error("[ISLCameraInput] webcam error:", msg);
      setError(msg);
      setStatus("error");
      setEnabled(false);
    },
    [],
  );

  return (
    <section
      aria-label="Sign language camera input"
      className="flex flex-col gap-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-space-grotesk">
          ISL Camera · Pose tracking
        </p>
        <StatusPill status={status} />
      </div>

      {/* Camera on/off toggle — the big gradient button. Starts OFF. */}
      <div className="flex items-center justify-center">
        <button
          onClick={() => setEnabled((v) => !v)}
          aria-label={enabled ? "Stop camera" : "Start camera"}
          aria-pressed={enabled}
          className={cn(
            "relative h-24 w-24 rounded-full grid place-items-center transition-all p-4 focus-ring",
            enabled
              ? "bg-gradient-to-br from-[#8B5CF6] to-[#C05177] text-white shadow-[0_12px_40px_rgba(139,92,246,0.55)]"
              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white border border-white/10 active:scale-95",
          )}
        >
          {enabled ? (
            <Camera className="h-9 w-9" aria-hidden strokeWidth={2.2} />
          ) : (
            <CameraOff className="h-9 w-9" aria-hidden strokeWidth={2.2} />
          )}
          {enabled && (
            <>
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-[#8B5CF6]/70 animate-pulse-ring"
              />
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border border-[#C05177]/50"
                style={{ transform: "scale(1.15)" }}
              />
            </>
          )}
        </button>
      </div>

      <div
        className={cn(
          "relative aspect-video rounded-xl overflow-hidden border bg-black",
          enabled
            ? "border-[#8B5CF6]/60 shadow-[0_0_32px_rgba(139,92,246,0.22)]"
            : "border-white/10",
        )}
      >
        {enabled ? (
          <>
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored
              screenshotFormat="image/jpeg"
              videoConstraints={{
                width: 640,
                height: 480,
                facingMode: "user",
              }}
              onUserMediaError={handleUserMediaError}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
            {status === "loading" && (
              <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
                <p className="text-xs text-zinc-300 font-inter animate-pulse">
                  Initialising MediaPipe Holistic…
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-zinc-950/80 backdrop-blur-sm">
            <div className="text-center">
              <CameraOff
                className="h-8 w-8 mx-auto mb-2 text-zinc-500 opacity-60"
                aria-hidden
              />
              <p className="text-xs text-zinc-500 font-inter">Tap the button to start camera</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-[#C05177] font-inter">
          Camera: {error}
        </p>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: "idle" | "loading" | "live" | "error" }) {
  const map = {
    idle: { color: "bg-zinc-500", label: "Off" },
    loading: { color: "bg-amber-400 animate-pulse", label: "Loading" },
    live: { color: "bg-emerald-400", label: "Live" },
    error: { color: "bg-red-500", label: "Error" },
  } as const;
  const { color, label } = map[status];
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-inter text-zinc-400"
      aria-label={label}
    >
      <span className={cn("h-2 w-2 rounded-full", color)} aria-hidden />
      {label}
    </span>
  );
}

function flatten(landmarks?: NormalizedLandmark[]): number[] {
  if (!landmarks) return [];
  const out = new Array<number>(landmarks.length * 3);
  for (let i = 0; i < landmarks.length; i++) {
    const l = landmarks[i];
    out[i * 3] = l.x;
    out[i * 3 + 1] = l.y;
    out[i * 3 + 2] = l.z;
  }
  return out;
}
