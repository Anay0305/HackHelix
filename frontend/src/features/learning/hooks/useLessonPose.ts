import { useEffect, useRef } from "react";
import { useSimulatorStore } from "@/store/simulatorStore";
import type { PoseSequence, WordPose } from "@/store/simulatorStore";
import { env } from "@/lib/env";

/**
 * Fetch a pose_sequence for the given gloss words from the backend and
 * push it into the simulator store, so the shared PoseDrivenAvatar plays it.
 *
 * If `loop` is true, re-fetches every (total duration + 600 ms) so the demo
 * keeps showing the sign until the user moves on.
 */
export function useLessonPose(words: string[] | undefined, loop = true) {
  const setPoseSequence = useSimulatorStore((s) => s.setPoseSequence);
  const setGloss = useSimulatorStore((s) => s.setGloss);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const tokens = (words ?? []).map((w) => w.toUpperCase().trim()).filter(Boolean);
    if (tokens.length === 0) return;

    let cancelled = false;

    const run = async () => {
      try {
        const url = `${env.backendUrl}/isl/pose?words=${encodeURIComponent(tokens.join(","))}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`pose fetch ${res.status}`);
        const data: { words: WordPose[]; msPerFrame: number } = await res.json();
        if (cancelled) return;

        const seq: PoseSequence = {
          words: data.words,
          msPerFrame: data.msPerFrame,
          startedAt: performance.now(),
        };
        setPoseSequence(seq);

        // Populate gloss tokens so any on-screen display reflects the SOV order.
        const perTokenMs = data.msPerFrame * 2;
        setGloss(
          tokens.map((t, i) => ({
            gloss: t,
            startMs: i * perTokenMs,
            endMs: (i + 1) * perTokenMs,
          })),
          tokens.join(" "),
          "neutral",
        );

        if (loop) {
          const totalFrames = data.words.reduce((a, w) => a + w.frames.length, 0);
          const ms = totalFrames * data.msPerFrame + 800;
          timerRef.current = setTimeout(run, ms);
        }
      } catch {
        // Silent — avatar stays in idle if backend is offline.
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      setPoseSequence(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(words), loop]);
}
