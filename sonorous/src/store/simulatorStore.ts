import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { GlossToken, SimulatorMode } from "@/api/types";
import type { WsStatus } from "@/api/socket";

export interface TranscriptChunk {
  id: string;
  text: string;
  confidence: number;
  partial: boolean;
  timestampMs: number;
}

export interface AvatarCue {
  clip: string;
  morphTargets?: Record<string, number>;
  durationMs: number;
  startedAt: number;
}

export interface TtsHistoryItem {
  id: string;
  text: string;
  audioUrl: string;
  timestampMs: number;
}

interface SimulatorState {
  mode: SimulatorMode;
  isLive: boolean;
  wsStatus: WsStatus;
  sessionId: string | null;

  // Speech → ISL
  transcripts: TranscriptChunk[];
  glossTokens: GlossToken[];
  sourceText: string;
  sentiment: "neutral" | "happy" | "urgent" | "sad";
  avatarCue: AvatarCue | null;

  // ISL → Speech
  recognized: string;
  recognizedConfidence: number;
  ttsHistory: TtsHistoryItem[];

  // metrics
  latencyMs: number;

  setMode: (m: SimulatorMode) => void;
  setIsLive: (live: boolean) => void;
  setWsStatus: (s: WsStatus) => void;
  setSessionId: (id: string | null) => void;

  appendTranscript: (t: TranscriptChunk) => void;
  setGloss: (
    tokens: GlossToken[],
    sourceText: string,
    sentiment: SimulatorState["sentiment"],
  ) => void;
  setAvatarCue: (c: AvatarCue) => void;

  setRecognized: (text: string, confidence: number) => void;
  appendTts: (item: TtsHistoryItem) => void;

  setLatency: (ms: number) => void;
  reset: () => void;
}

const initial = {
  mode: "speech2isl" as SimulatorMode,
  isLive: false,
  wsStatus: "idle" as WsStatus,
  sessionId: null,
  transcripts: [],
  glossTokens: [],
  sourceText: "",
  sentiment: "neutral" as const,
  avatarCue: null,
  recognized: "",
  recognizedConfidence: 0,
  ttsHistory: [],
  latencyMs: 0,
};

export const useSimulatorStore = create<SimulatorState>()(
  subscribeWithSelector((set) => ({
    ...initial,
    setMode: (mode) => set({ mode }),
    setIsLive: (isLive) => set({ isLive }),
    setWsStatus: (wsStatus) => set({ wsStatus }),
    setSessionId: (sessionId) => set({ sessionId }),

    appendTranscript: (t) =>
      set((s) => ({
        transcripts: [...s.transcripts.slice(-29), t],
      })),
    setGloss: (glossTokens, sourceText, sentiment) =>
      set({ glossTokens, sourceText, sentiment }),
    setAvatarCue: (avatarCue) => set({ avatarCue }),

    setRecognized: (recognized, recognizedConfidence) =>
      set({ recognized, recognizedConfidence }),
    appendTts: (item) =>
      set((s) => ({ ttsHistory: [item, ...s.ttsHistory.slice(0, 4)] })),

    setLatency: (latencyMs) => set({ latencyMs }),
    reset: () => set(initial),
  })),
);
