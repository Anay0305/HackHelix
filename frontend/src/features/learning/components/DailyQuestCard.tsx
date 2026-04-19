import { useEffect } from "react";
import { motion } from "framer-motion";
import { Gift, Target, Zap, Camera, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useLearningStore, type QuestKind } from "@/store";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const kindIcon: Record<QuestKind, typeof Target> = {
  drills: Target,
  highScore: Zap,
  cameraPractice: Camera,
};

export function DailyQuestCard() {
  const ensure = useLearningStore((s) => s.ensureDailyQuests);
  const quests = useLearningStore((s) => s.quests);
  const claimed = useLearningStore((s) => s.questsChestClaimed);
  const claim = useLearningStore((s) => s.claimQuestsChest);

  useEffect(() => {
    ensure();
  }, [ensure]);

  const allDone = quests.length > 0 && quests.every((q) => q.done);

  function handleClaim() {
    const bonus = claim();
    if (bonus > 0) {
      toast.success(`Daily chest opened! +${bonus} XP`, {
        description: "Come back tomorrow for new quests.",
      });
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-purple">
              Daily Quests
            </p>
            <p className="text-xs text-muted mt-0.5">
              Reset at midnight. Finish all 3 for a chest.
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleClaim}
            disabled={!allDone || claimed}
            aria-label={
              claimed
                ? "Daily chest claimed"
                : allDone
                  ? "Open daily chest"
                  : "Daily chest locked"
            }
            className={cn(
              "h-11 w-11 rounded-full grid place-items-center transition-all",
              claimed
                ? "bg-emerald-500/20 text-emerald-400"
                : allDone
                  ? "bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-[0_4px_16px_rgba(244,114,182,0.4)] animate-pulse"
                  : "bg-zinc-800 text-zinc-600",
            )}
          >
            {claimed ? (
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            ) : (
              <Gift className="h-5 w-5" aria-hidden />
            )}
          </motion.button>
        </div>

        <ul className="space-y-2">
          {quests.map((q) => {
            const Icon = kindIcon[q.kind];
            const pct = Math.min(1, q.progress / q.target);
            return (
              <li
                key={q.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg p-2.5 transition-colors",
                  q.done ? "bg-emerald-500/10" : "bg-white/5",
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 shrink-0 rounded-full grid place-items-center",
                    q.done
                      ? "bg-emerald-500 text-white"
                      : "bg-brand-purple/20 text-brand-purple",
                  )}
                >
                  {q.done ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm truncate",
                        q.done ? "text-emerald-300" : "text-ink",
                      )}
                    >
                      {q.label}
                    </p>
                    <span className="text-[11px] font-mono text-muted">
                      {q.progress}/{q.target}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={false}
                      animate={{ width: `${pct * 100}%` }}
                      transition={{ type: "spring", stiffness: 200, damping: 24 }}
                      className={cn(
                        "h-full rounded-full",
                        q.done
                          ? "bg-emerald-400"
                          : "bg-gradient-to-r from-brand-purple to-brand-rose",
                      )}
                    />
                  </div>
                </div>
                <span className="text-[11px] font-semibold gradient-text shrink-0">
                  +{q.xpReward}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
