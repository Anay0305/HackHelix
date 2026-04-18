import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { TopBar } from "@/components/common/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { restClient } from "@/api/rest";
import { useLearningStore } from "@/store";
import { SkillTree } from "../components/SkillTree";
import { StreakFlame } from "../components/StreakFlame";
import { ProgressRing } from "../components/ProgressRing";

export function LearnHomePage() {
  const { data: lessons, isLoading } = useQuery({
    queryKey: ["curriculum"],
    queryFn: () => restClient.getCurriculum(),
  });
  const xp = useLearningStore((s) => s.xp);
  const streak = useLearningStore((s) => s.streakDays);
  const dailyGoal = useLearningStore((s) => s.dailyGoalXp);

  const todayXp = Math.min(xp % dailyGoal, dailyGoal);
  const dayProgress = Math.min(1, (xp % dailyGoal) / dailyGoal);
  const goalHit = todayXp >= dailyGoal || xp >= dailyGoal;

  return (
    <div className="relative">
      <TopBar
        title="Learn Indian Sign Language"
        subtitle="Bridge the communication gap — one sign at a time."
      />

      <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto space-y-6">
        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {/* Streak */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.02 }}
          >
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <StreakFlame days={streak} />
                <div>
                  <p className="text-xl font-display font-semibold leading-tight text-white">
                    {streak}d
                  </p>
                  <p className="text-xs text-muted">
                    {streak === 0
                      ? "Start your streak"
                      : streak === 1
                        ? "Day one"
                        : "Streak"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* XP */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <div className="h-11 w-11 rounded-full grid place-items-center text-white shadow-lg bg-brand-primary">
                  <Zap className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-xl font-display font-semibold leading-tight text-white">
                    {xp}
                  </p>
                  <p className="text-xs text-muted">Total XP</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Daily goal ring */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <Card>
              <CardContent className="pt-3 pb-3 flex items-center gap-3">
                <ProgressRing
                  value={dayProgress}
                  size={56}
                  strokeWidth={5}
                  label={`${Math.round(dayProgress * 100)}%`}
                />
                <div className="min-w-0">
                  <p className="text-[11px] text-muted uppercase tracking-wider">
                    Today
                  </p>
                  <p className="font-semibold text-ink mt-0.5 text-sm truncate">
                    {todayXp} / {dailyGoal} XP
                  </p>
                  <p
                    className={`text-[10px] mt-0.5 ${goalHit ? "text-emerald-300" : "text-muted"}`}
                  >
                    {goalHit ? "Goal hit!" : "Keep going"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Unit label */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-purple">
            Your journey
          </p>
          <h2 className="font-display text-3xl font-semibold mt-1">
            ISL Foundations
          </h2>
          <p className="text-sm text-muted mt-1">
            10 curated lessons across 3 units. Tap a node to begin.
          </p>
        </div>

        {/* Skill tree */}
        {isLoading ? (
          <Skeleton className="h-[560px] w-full rounded-xl2" />
        ) : (
          <SkillTree lessons={lessons ?? []} />
        )}
      </div>
    </div>
  );
}
