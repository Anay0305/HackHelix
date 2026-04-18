import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface LearningState {
  xp: number;
  streakDays: number;
  lastActiveDate: string | null; // YYYY-MM-DD
  completedLessonIds: string[];
  currentLessonId: string | null;
  dailyGoalXp: number;

  awardXp: (amount: number) => void;
  completeLesson: (lessonId: string, score: number) => void;
  setCurrentLesson: (id: string | null) => void;
  tickStreak: () => void;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      xp: 0,
      streakDays: 0,
      lastActiveDate: null,
      completedLessonIds: [],
      currentLessonId: null,
      dailyGoalXp: 50,

      awardXp: (amount) => set((s) => ({ xp: s.xp + amount })),
      completeLesson: (lessonId, _score) => {
        const { completedLessonIds, streakDays, lastActiveDate } = get();
        const today = todayKey();
        const isNewDay = lastActiveDate !== today;

        set({
          completedLessonIds: completedLessonIds.includes(lessonId)
            ? completedLessonIds
            : [...completedLessonIds, lessonId],
          streakDays: isNewDay ? streakDays + 1 : streakDays,
          lastActiveDate: today,
        });
      },
      setCurrentLesson: (id) => set({ currentLessonId: id }),
      tickStreak: () => {
        const today = todayKey();
        const { lastActiveDate, streakDays } = get();
        if (lastActiveDate === today) return;
        set({ streakDays: streakDays + 1, lastActiveDate: today });
      },
    }),
    {
      name: "sonorous:learning",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
