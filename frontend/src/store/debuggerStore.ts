import { create } from "zustand";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error";
  msg: string;
  latencyMs?: number;
  meta?: unknown;
}

interface DebuggerState {
  logs: LogEntry[];
  lastPayload: unknown;
  confidenceHistory: { t: number; v: number }[];
  latencyHistory: { t: number; v: number }[];
  pushLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void;
  clearLogs: () => void;
  setLastPayload: (p: unknown) => void;
  pushConfidence: (v: number) => void;
  pushLatency: (v: number) => void;
}

const MAX_LOGS = 500;
const MAX_HISTORY = 60;

export const useDebuggerStore = create<DebuggerState>((set) => ({
  logs: [],
  lastPayload: null,
  confidenceHistory: [],
  latencyHistory: [],

  pushLog: (entry) =>
    set((s) => {
      const next: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        ...entry,
      };
      return { logs: [...s.logs, next].slice(-MAX_LOGS) };
    }),
  clearLogs: () => set({ logs: [] }),
  setLastPayload: (lastPayload) => set({ lastPayload }),
  pushConfidence: (v) =>
    set((s) => ({
      confidenceHistory: [
        ...s.confidenceHistory,
        { t: Date.now(), v },
      ].slice(-MAX_HISTORY),
    })),
  pushLatency: (v) =>
    set((s) => ({
      latencyHistory: [...s.latencyHistory, { t: Date.now(), v }].slice(
        -MAX_HISTORY,
      ),
    })),
}));
