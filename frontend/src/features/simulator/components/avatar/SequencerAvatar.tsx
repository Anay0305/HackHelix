import { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import {
  LoopOnce,
  type AnimationAction,
  type AnimationClip,
  type Group,
} from "three";
import { useSimulatorStore } from "@/store/simulatorStore";

/**
 * Phase-11 Animation Sequencer — no idle state.
 * ==============================================
 *
 * Loads the main Avaturn rig + 4 pre-baked sign clips, renames each clip's
 * internal animation track (which Blender exports as "Take 01") to its gloss
 * key, and walks the live `gloss` string from the WebSocket store one word at
 * a time. When the sequence finishes the avatar simply stops on the last
 * frame — no idle loop.
 *
 * Out-of-vocabulary words are logged via console.warn and skipped.
 */

// Browser auto-encodes the space + parens; vite serves the literal filename.
const MODEL_PATH = "/model (1).glb";
const FADE_S = 0.3;
// Hold the final frame of each clip for this long before the next sign starts.
// Without it, the crossfade blends one sign straight into the next and viewers
// can't tell where one stops and the next begins.
const POSE_HOLD_MS = 700;

// gloss-uppercase → public-folder path. Add a sign by dropping its `.glb` in
// /public, registering one entry here, and (in the loader below) mutating the
// new clip's `.name`.
const CLIP_PATHS: Record<string, string> = {
  HELLO: "/hello.glb",
  YOU: "/you.glb",
  NAME: "/name.glb",
  WHAT: "/what.glb",
};

// Warm the loader cache up front so the first sequencer trigger has zero
// asset latency.
useGLTF.preload(MODEL_PATH);
Object.values(CLIP_PATHS).forEach((p) => useGLTF.preload(p));

export function SequencerAvatar() {
  const groupRef = useRef<Group>(null);

  // ── 1. Load model + each clip ──────────────────────────────────────────────
  const main = useGLTF(MODEL_PATH);
  const { animations: helloAnim } = useGLTF(CLIP_PATHS.HELLO);
  const { animations: youAnim } = useGLTF(CLIP_PATHS.YOU);
  const { animations: nameAnim } = useGLTF(CLIP_PATHS.NAME);
  const { animations: whatAnim } = useGLTF(CLIP_PATHS.WHAT);

  // ── Rename in place to prevent "Take 01" collisions ────────────────────────
  // Direct mutation of the cached AnimationClip is idempotent: subsequent
  // renders see the already-renamed clip. useAnimations needs unique names so
  // `actions[GLOSS]` resolves correctly across the merged set.
  if (helloAnim[0]) helloAnim[0].name = "HELLO";
  if (youAnim[0]) youAnim[0].name = "YOU";
  if (nameAnim[0]) nameAnim[0].name = "NAME";
  if (whatAnim[0]) whatAnim[0].name = "WHAT";

  const clips: AnimationClip[] = useMemo(
    () =>
      [helloAnim[0], youAnim[0], nameAnim[0], whatAnim[0]].filter(
        Boolean,
      ) as AnimationClip[],
    [helloAnim, youAnim, nameAnim, whatAnim],
  );

  // ── 2. Bind the merged clip set to the main model's ref ────────────────────
  const { actions, mixer } = useAnimations(clips, groupRef);

  // ── 3. Live gloss from the WebSocket store ─────────────────────────────────
  // Joined → Zustand returns the same string instance for identical state, so
  // the sequencer effect only fires on real updates.
  const glossString = useSimulatorStore((s) =>
    s.glossTokens.map((t) => t.gloss.toUpperCase()).join(" "),
  );

  // ── 4. Sequencer state ─────────────────────────────────────────────────────
  const currentActionRef = useRef<AnimationAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  /**
   * Play `name` once. Blends from whatever was playing previously and clamps
   * on the final frame so the pose holds when the clip ends — no T-pose snap
   * before the next clip starts (or after the last clip when the queue empties).
   */
  function playClip(name: string): AnimationAction | null {
    const action = actions[name];
    if (!action) return null;

    action.reset();
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;

    const prev = currentActionRef.current;
    if (prev && prev !== action) {
      action.crossFadeFrom(prev, FADE_S, true);
    } else {
      action.fadeIn(FADE_S);
    }
    action.play();
    currentActionRef.current = action;
    return action;
  }

  // ── 5. Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimer();
      currentActionRef.current?.fadeOut(FADE_S);
      currentActionRef.current = null;
      mixer?.stopAllAction();
    };
  }, [mixer]);

  // ── 6. The brain: react to gloss updates and walk the queue ────────────────
  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;
    if (!glossString) return;

    clearTimer();
    const queue = glossString.split(/\s+/).filter(Boolean);
    let cancelled = false;

    const playNext = (i: number) => {
      if (cancelled) return;
      if (i >= queue.length) {
        // Sequence finished — leave the avatar clamped on the last frame.
        // No idle loop, no return motion. It just holds the final pose.
        return;
      }

      const word = queue[i];
      const action = actions[word];

      if (!action) {
        console.warn(`[sequencer] OOV gloss "${word}" — skipping`);
        playNext(i + 1);
        return;
      }

      const played = playClip(word);
      const durationMs = (played?.getClip().duration ?? 1) * 1000;
      // clip plays for `durationMs`, then the avatar holds the final frame
      // (clampWhenFinished=true) for POSE_HOLD_MS before the next sign starts.
      timerRef.current = setTimeout(
        () => playNext(i + 1),
        durationMs + POSE_HOLD_MS,
      );
    };

    playNext(0);
    return () => {
      cancelled = true;
      clearTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glossString, actions]);

  // Bind the loaded scene under our ref so the AnimationMixer actually targets
  // its bones. Scale + position are sensible defaults to keep a humanoid rig
  // centered and at a viewable size — adjust per asset if needed.
  return (
    <primitive
      ref={groupRef}
      object={main.scene}
      dispose={null}
      scale={1.5}
      position={[0, -1.5, 0]}
    />
  );
}

/**
 * Eagerly preload all clips from outside the canvas. Safe to call repeatedly.
 */
export function preloadSequencerAvatar() {
  useGLTF.preload(MODEL_PATH);
  Object.values(CLIP_PATHS).forEach((p) => useGLTF.preload(p));
}
