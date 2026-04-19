import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type QuestKind = "drills" | "highScore" | "cameraPractice";

export interface DailyQuest {
  id: string;
  kind: QuestKind;
  label: string;
  target: number;
  progress: number;
  xpReward: number;
  done: boolean;
}

interface LearningState {
  xp: number;
  streakDays: number;
  lastActiveDate: string | null; // YYYY-MM-DD
  completedLessonIds: string[];
  currentLessonId: string | null;
  dailyGoalXp: number;

  // Hearts — Duolingo-style mistake budget
  hearts: number;
  maxHearts: number;
  heartRefillAt: number | null; // epoch ms when next heart regenerates

  // Daily Quests — reset when questsDate != today
  questsDate: string | null;
  quests: DailyQuest[];
  questsChestClaimed: boolean;

  awardXp: (amount: number) => void;
  completeLesson: (lessonId: string, score: number) => void;
  setCurrentLesson: (id: string | null) => void;
  tickStreak: () => void;

  loseHeart: () => boolean; // returns true if a heart was available
  regenHearts: () => void;

  ensureDailyQuests: () => void;
  progressQuest: (kind: QuestKind, amount?: number) => void;
  claimQuestsChest: () => number; // returns bonus XP claimed
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const HEART_REGEN_MS = 20 * 60 * 1000; // 20 min per heart

const QUEST_TEMPLATES: Array<Omit<DailyQuest, "progress" | "done">> = [
  { id: "drills", kind: "drills", label: "Complete 3 drills", target: 3, xpReward: 15 },
  { id: "highScore", kind: "highScore", label: "Score 80%+ on 2 drills", target: 2, xpReward: 15 },
  { id: "cameraPractice", kind: "cameraPractice", label: "Practice 1 sign on camera", target: 1, xpReward: 20 },
];

function freshQuests(): DailyQuest[] {
  return QUEST_TEMPLATES.map((q) => ({ ...q, progress: 0, done: false }));
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

      hearts: 5,
      maxHearts: 5,
      heartRefillAt: null,

      questsDate: null,
      quests: freshQuests(),
      questsChestClaimed: false,

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

      loseHeart: () => {
        get().regenHearts(); // catch up first
        const { hearts, heartRefillAt } = get();
        if (hearts <= 0) return false;
        const nextHearts = hearts - 1;
        set({
          hearts: nextHearts,
          // if we were already refilling, leave the timer; else start one
          heartRefillAt:
            heartRefillAt && heartRefillAt > Date.now()
              ? heartRefillAt
              : Date.now() + HEART_REGEN_MS,
        });
        return true;
      },
      regenHearts: () => {
        const { hearts, maxHearts, heartRefillAt } = get();
        if (hearts >= maxHearts || !heartRefillAt) return;
        const now = Date.now();
        if (now < heartRefillAt) return;
        const elapsed = now - heartRefillAt;
        const gained = 1 + Math.floor(elapsed / HEART_REGEN_MS);
        const nextHearts = Math.min(maxHearts, hearts + gained);
        const leftover = elapsed - (gained - 1) * HEART_REGEN_MS;
        set({
          hearts: nextHearts,
          heartRefillAt:
            nextHearts >= maxHearts ? null : now + (HEART_REGEN_MS - leftover),
        });
      },

      ensureDailyQuests: () => {
        const today = todayKey();
        if (get().questsDate === today) return;
        set({
          questsDate: today,
          quests: freshQuests(),
          questsChestClaimed: false,
        });
      },
      progressQuest: (kind, amount = 1) => {
        get().ensureDailyQuests();
        set((s) => ({
          quests: s.quests.map((q) =>
            q.kind === kind && !q.done
              ? (() => {
                  const next = Math.min(q.target, q.progress + amount);
                  return { ...q, progress: next, done: next >= q.target };
                })()
              : q,
          ),
        }));
      },
      claimQuestsChest: () => {
        const { quests, questsChestClaimed } = get();
        if (questsChestClaimed) return 0;
        const allDone = quests.every((q) => q.done);
        if (!allDone) return 0;
        const bonus = quests.reduce((acc, q) => acc + q.xpReward, 0);
        set((s) => ({
          questsChestClaimed: true,
          xp: s.xp + bonus,
        }));
        return bonus;
      },
    }),
    {
      name: "sonorous:learning",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
