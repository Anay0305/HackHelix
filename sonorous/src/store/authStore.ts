import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User, UserProfile } from "@/api/types";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  token: string | null;
  hasCompletedOnboarding: boolean;

  setAuth: (u: User, token: string) => void;
  setProfile: (p: UserProfile) => void;
  markOnboardingComplete: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      profile: null,
      token: null,
      hasCompletedOnboarding: false,

      setAuth: (user, token) => {
        localStorage.setItem("sonorous:token", token);
        set({ user, token });
      },
      setProfile: (profile) => set({ profile }),
      markOnboardingComplete: () => set({ hasCompletedOnboarding: true }),
      logout: () => {
        localStorage.removeItem("sonorous:token");
        set({
          user: null,
          profile: null,
          token: null,
          hasCompletedOnboarding: false,
        });
      },
    }),
    {
      name: "sonorous:auth",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
