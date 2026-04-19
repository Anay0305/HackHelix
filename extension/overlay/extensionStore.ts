/**
 * Minimal Zustand store shim for the Chrome extension overlay.
 * Exports `useSimulatorStore` under the same name as the main app store so
 * ProceduralAvatar.tsx (aliased via vite.config.ts) works without modification.
 * Only includes the state fields ProceduralAvatar actually reads.
 */
import { create } from "zustand";

export interface ArmLandmark {
  x: number;
  y: number;
}

export interface ArmFrame {
  rs: ArmLandmark;
  re: ArmLandmark;
  rw: ArmLandmark;
  ls: ArmLandmark;
  le: ArmLandmark;
  lw: ArmLandmark;
  rightHand?: ArmLandmark[];
  leftHand?: ArmLandmark[];
}

export interface WordPose {
  word: string;
  frames: ArmFrame[];
}

export interface PoseSequence {
  words: WordPose[];
  msPerFrame: number;
  startedAt: number;
}

export interface AvatarCue {
  clip: string;
  morphTargets?: Record<string, number>;
  durationMs: number;
  startedAt: number;
}

interface ExtensionState {
  isLive: boolean;
  avatarCue: AvatarCue | null;
  sentiment: "neutral" | "happy" | "urgent" | "sad";
  poseSequence: PoseSequence | null;
  gloss: string[];

  setIsLive: (live: boolean) => void;
  setAvatarCue: (cue: AvatarCue) => void;
  setSentiment: (s: ExtensionState["sentiment"]) => void;
  setPoseSequence: (ps: PoseSequence | null) => void;
  setGloss: (g: string[]) => void;
}

export const useSimulatorStore = create<ExtensionState>()((set) => ({
  isLive: false,
  avatarCue: null,
  sentiment: "neutral",
  poseSequence: null,
  gloss: [],

  setIsLive: (isLive) => set({ isLive }),
  setAvatarCue: (avatarCue) => set({ avatarCue }),
  setSentiment: (sentiment) => set({ sentiment }),
  setPoseSequence: (poseSequence) => set({ poseSequence }),
  setGloss: (gloss) => set({ gloss }),
}));

// Re-exported alias for overlay.tsx to use without importing under the store name
export const useExtensionStore = useSimulatorStore;
