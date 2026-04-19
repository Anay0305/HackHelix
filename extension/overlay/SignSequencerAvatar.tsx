import { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import {
  LoopOnce,
  type AnimationAction,
  type AnimationClip,
  type Group,
} from "three";
import { useSimulatorStore } from "@/store/simulatorStore";
import modelUrl from "./model.glb?url";
import helloUrl from "./hello.glb?url";
import youUrl from "./you.glb?url";
import nameUrl from "./name.glb?url";
import whatUrl from "./what.glb?url";

const FADE_S = 0.3;
const POSE_HOLD_MS = 700;

const CLIP_PATHS: Record<string, string> = {
  HELLO: helloUrl,
  YOU: youUrl,
  NAME: nameUrl,
  WHAT: whatUrl,
};

useGLTF.preload(modelUrl);
Object.values(CLIP_PATHS).forEach((p) => useGLTF.preload(p));

export function SignSequencerAvatar() {
  const groupRef = useRef<Group>(null);

  const main = useGLTF(modelUrl);
  const { animations: helloAnim } = useGLTF(CLIP_PATHS.HELLO);
  const { animations: youAnim } = useGLTF(CLIP_PATHS.YOU);
  const { animations: nameAnim } = useGLTF(CLIP_PATHS.NAME);
  const { animations: whatAnim } = useGLTF(CLIP_PATHS.WHAT);

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

  const { actions, mixer } = useAnimations(clips, groupRef);

  // Extension store keeps gloss as string[]; join to match frontend's glossString pattern
  const glossString = useSimulatorStore((s) => s.gloss.join(" "));

  const currentActionRef = useRef<AnimationAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

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

  useEffect(() => {
    return () => {
      clearTimer();
      currentActionRef.current?.fadeOut(FADE_S);
      currentActionRef.current = null;
      mixer?.stopAllAction();
    };
  }, [mixer]);

  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;
    if (!glossString) return;

    clearTimer();
    const queue = glossString.split(/\s+/).filter(Boolean);
    let cancelled = false;

    const playNext = (i: number) => {
      if (cancelled) return;
      if (i >= queue.length) return;

      const word = queue[i];
      if (!actions[word]) {
        console.warn(`[sequencer] OOV gloss "${word}" — skipping`);
        playNext(i + 1);
        return;
      }

      const played = playClip(word);
      const durationMs = (played?.getClip().duration ?? 1) * 1000;
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
  }, [glossString, actions]);

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
