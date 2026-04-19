import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { WsStatus } from "@/api/socket";

export type AlertType =
  | "fire_alarm"
  | "alarm"
  | "doorbell"
  | "horn"
  | "siren"
  | "phone"
  | "bell"
  | "baby_cry";

export interface SoundAlert {
  id: string;
  alertType: AlertType;
  confidence: number;
  label: string;
  timestampMs: number;
}

interface SoundMonitorState {
  isLive: boolean;
  wsStatus: WsStatus;
  bufferedMs: number;

  alerts: SoundAlert[];              // newest first, capped at MAX_ALERTS
  latest: SoundAlert | null;

  // Per-type mute toggles
  muted: Record<AlertType, boolean>;
  // Per-type vibration pattern, in milliseconds: [buzz, pause, buzz, pause, …]
  // Empty array = no vibration for that type.
  vibration: Record<AlertType, number[]>;

  setIsLive: (v: boolean) => void;
  setWsStatus: (s: WsStatus) => void;
  setBufferedMs: (ms: number) => void;

  pushAlert: (a: SoundAlert) => void;
  clearAlerts: () => void;
  toggleMute: (t: AlertType) => void;
  markAcknowledged: (id: string) => void;

  setVibration: (t: AlertType, pattern: number[]) => void;
  resetVibration: (t: AlertType) => void;
  testVibration: (t: AlertType) => void;
}

const MAX_ALERTS = 50;

const defaultMuted: Record<AlertType, boolean> = {
  fire_alarm: false,
  alarm:      false,
  doorbell:   false,
  horn:       false,
  siren:      false,
  phone:      false,
  bell:       false,
  baby_cry:   false,
};

// Defaults tuned to feel distinct: critical = long SOS-style bursts,
// attention = medium double-buzz, info = short triple-buzz.
export const DEFAULT_VIBRATION: Record<AlertType, number[]> = {
  fire_alarm: [400, 100, 400, 100, 400, 100, 400], // long, urgent
  siren:      [300, 80, 300, 80, 300, 80, 300],
  horn:       [200, 60, 200, 60, 200],
  alarm:      [250, 80, 250, 80, 250],
  baby_cry:   [150, 50, 150, 50, 150, 50, 150],
  doorbell:   [180, 100, 180],                     // ding-dong
  phone:      [100, 60, 100, 60, 100, 60, 100],
  bell:       [120, 80, 120],
};

export const useSoundMonitorStore = create<SoundMonitorState>()(
  persist(
    (set, get) => ({
      isLive: false,         // NEVER persisted — always reset on reload
      wsStatus: "idle",
      bufferedMs: 0,
      alerts: [],
      latest: null,
      muted: defaultMuted,
      vibration: { ...DEFAULT_VIBRATION },

      setIsLive: (isLive) => set({ isLive }),
      setWsStatus: (wsStatus) => set({ wsStatus }),
      setBufferedMs: (bufferedMs) => set({ bufferedMs }),

      pushAlert: (a) => {
        if (get().muted[a.alertType]) return;
        set((s) => ({
          latest: a,
          alerts: [a, ...s.alerts].slice(0, MAX_ALERTS),
        }));
      },
      clearAlerts: () => set({ alerts: [], latest: null }),
      toggleMute: (t) =>
        set((s) => ({ muted: { ...s.muted, [t]: !s.muted[t] } })),
      markAcknowledged: (id) =>
        set((s) => ({
          latest: s.latest?.id === id ? null : s.latest,
        })),

      setVibration: (t, pattern) =>
        set((s) => ({ vibration: { ...s.vibration, [t]: pattern } })),
      resetVibration: (t) =>
        set((s) => ({
          vibration: { ...s.vibration, [t]: [...DEFAULT_VIBRATION[t]] },
        })),
      testVibration: (t) => {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(get().vibration[t] ?? []);
        }
      },
    }),
    {
      name: "sonorous:soundMonitor",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // Don't persist volatile fields — isLive/wsStatus/bufferedMs must
      // always come up fresh so stale "Listening/Disconnected" never shows.
      partialize: (s) => ({
        muted: s.muted,
        vibration: s.vibration,
        alerts: s.alerts.slice(0, 20),
      }),
    },
  ),
);
