import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface DevModeState {
  isDevMode: boolean;
  _clickTimes: number[];
  registerLogoClick: () => boolean; // returns true if activated this click
  activate: () => void;
  deactivate: () => void;
}

const CLICKS_REQUIRED = 5;
const WINDOW_MS = 2000;

export const useDevModeStore = create<DevModeState>()(
  persist(
    (set, get) => ({
      isDevMode: false,
      _clickTimes: [],

      registerLogoClick: () => {
        const now = Date.now();
        const recent = [...get()._clickTimes, now].filter(
          (t) => now - t <= WINDOW_MS,
        );
        if (recent.length >= CLICKS_REQUIRED) {
          set({ _clickTimes: [], isDevMode: true });
          return true;
        }
        set({ _clickTimes: recent });
        return false;
      },

      activate: () => set({ isDevMode: true, _clickTimes: [] }),
      deactivate: () => set({ isDevMode: false, _clickTimes: [] }),
    }),
    {
      name: "sonorous:devmode",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ isDevMode: s.isDevMode }),
    },
  ),
);
