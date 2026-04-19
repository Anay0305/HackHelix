import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BenefitCategory } from "@/api/types";

interface BenefitsState {
  filters: {
    category: BenefitCategory | "all";
    state: string | "all";
    search: string;
    personalizedOnly: boolean;
  };
  savedIds: string[];

  setFilter: <K extends keyof BenefitsState["filters"]>(
    key: K,
    value: BenefitsState["filters"][K],
  ) => void;
  resetFilters: () => void;
  toggleSaved: (id: string) => void;
}

const defaultFilters = {
  category: "all" as const,
  state: "all" as const,
  search: "",
  personalizedOnly: true,
};

export const useBenefitsStore = create<BenefitsState>()(
  persist(
    (set) => ({
      filters: defaultFilters,
      savedIds: [],
      setFilter: (key, value) =>
        set((s) => ({ filters: { ...s.filters, [key]: value } })),
      resetFilters: () => set({ filters: defaultFilters }),
      toggleSaved: (id) =>
        set((s) => ({
          savedIds: s.savedIds.includes(id)
            ? s.savedIds.filter((x) => x !== id)
            : [...s.savedIds, id],
        })),
    }),
    {
      name: "sonorous:benefits",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ savedIds: s.savedIds }),
    },
  ),
);
