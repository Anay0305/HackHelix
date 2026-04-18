import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface LessonScore {
  stars: number; // 0-3
  accuracy: number; // 0-1
  completedAt: string; // ISO date
}

interface LearningState {
  xp: number;
  streakDays: number;
  lastActiveDate: string | null; // YYYY-MM-DD
  completedLessonIds: string[];
  currentLessonId: string | null;
  dailyGoalXp: number;
  lessonScores: Record<string, LessonScore>;

  awardXp: (amount: number) => void;
  completeLesson: (lessonId: string, accuracy: number) => void;
  setCurrentLesson: (id: string | null) => void;
  tickStreak: () => void;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function starsFor(accuracy: number): number {
  if (accuracy >= 0.9) return 3;
  if (accuracy >= 0.75) return 2;
  if (accuracy > 0) return 1;
  return 0;
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
      lessonScores: {},

      awardXp: (amount) => set((s) => ({ xp: s.xp + amount })),
      completeLesson: (lessonId, accuracy) => {
        const { completedLessonIds, streakDays, lastActiveDate, lessonScores } =
          get();
        const today = todayKey();
        const isNewDay = lastActiveDate !== today;
        const prev = lessonScores[lessonId];
        const newStars = starsFor(accuracy);
        const nextScore: LessonScore =
          prev && prev.stars >= newStars
            ? prev
            : {
                stars: newStars,
                accuracy,
                completedAt: new Date().toISOString(),
              };

        set({
          completedLessonIds: completedLessonIds.includes(lessonId)
            ? completedLessonIds
            : [...completedLessonIds, lessonId],
          streakDays: isNewDay ? streakDays + 1 : streakDays,
          lastActiveDate: today,
          lessonScores: { ...lessonScores, [lessonId]: nextScore },
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

export { starsFor };
