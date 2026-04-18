import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Flame,
  Zap,
  Lock,
  Check,
  Hand,
  Users,
  Hash,
  Utensils,
  HelpCircle,
  Smile,
  Calendar,
  Map,
  HeartPulse,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import { TopBar } from "@/components/common/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { restClient } from "@/api/rest";
import { useLearningStore } from "@/store";
import { cn } from "@/lib/cn";
import type { Lesson } from "@/api/types";

const iconMap: Record<string, LucideIcon> = {
  hand: Hand,
  users: Users,
  hash: Hash,
  utensils: Utensils,
  "help-circle": HelpCircle,
  smile: Smile,
  calendar: Calendar,
  map: Map,
  "heart-pulse": HeartPulse,
  briefcase: Briefcase,
};

export function LearnHomePage() {
  const { data: lessons, isLoading } = useQuery({
    queryKey: ["curriculum"],
    queryFn: () => restClient.getCurriculum(),
  });
  const xp = useLearningStore((s) => s.xp);
  const streak = useLearningStore((s) => s.streakDays);
  const completedIds = useLearningStore((s) => s.completedLessonIds);
  const dailyGoal = useLearningStore((s) => s.dailyGoalXp);

  const dayProgress = Math.min(1, (xp % dailyGoal) / dailyGoal);

  return (
    <div className="relative">
      <TopBar
        title="Learn Indian Sign Language"
        subtitle="Bridge the communication gap — one sign at a time."
      />

      <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto space-y-6">
        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          <StatBadge
            icon={Flame}
            value={`${streak}d`}
            label="Streak"
            tone="rose"
          />
          <StatBadge
            icon={Zap}
            value={`${xp}`}
            label="Total XP"
            tone="purple"
          />
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] text-muted uppercase tracking-wider">
                Today
              </p>
              <p className="font-semibold text-ink mt-1">
                {Math.min(xp % dailyGoal, dailyGoal)} / {dailyGoal} XP
              </p>
              <Progress value={dayProgress} className="mt-2" color="emerald" />
            </CardContent>
          </Card>
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
            10 curated lessons: greetings, family, emotions, travel and more.
          </p>
        </div>

        {/* Roadmap */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl2" />
            ))}
          </div>
        ) : (
          <RoadmapTree lessons={lessons ?? []} completedIds={completedIds} />
        )}
      </div>
    </div>
  );
}

function StatBadge({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  tone: "rose" | "purple";
}) {
  const bg = {
    rose: "bg-brand-tertiary",
    purple: "bg-brand-primary",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <div
          className={cn(
            "h-11 w-11 rounded-full grid place-items-center text-white shadow-lg",
            bg,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-xl font-display font-semibold leading-tight text-white">
            {value}
          </p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RoadmapTree({
  lessons,
  completedIds,
}: {
  lessons: Lesson[];
  completedIds: string[];
}) {
  const firstIncomplete = lessons.find((l) => !completedIds.includes(l.id));

  return (
    <div className="relative">
      {/* Connecting line */}
      <div
        aria-hidden
        className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-brand-purple/40 via-brand-purple/20 to-transparent"
      />

      <ul className="space-y-3">
        {lessons.map((lesson, idx) => {
          const completed = completedIds.includes(lesson.id);
          const prereqsMet = lesson.prerequisiteIds.every((p) =>
            completedIds.includes(p),
          );
          const current = lesson.id === firstIncomplete?.id;
          const locked = !prereqsMet && !completed;
          const Icon = iconMap[lesson.iconKey] ?? Hand;

          return (
            <motion.li
              key={lesson.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="relative"
            >
              <Link
                to={locked ? "#" : `/learn/${lesson.id}`}
                onClick={(e) => locked && e.preventDefault()}
                aria-disabled={locked}
                aria-label={`${lesson.title}${completed ? " (complete)" : current ? " (up next)" : locked ? " (locked)" : ""}`}
                className={cn(
                  "flex items-center gap-4 rounded-xl2 glass p-4 transition-all focus-ring",
                  completed && "border-emerald-500/30",
                  current && "border-brand-purple/50 shadow-glow-brand",
                  locked && "opacity-50 cursor-not-allowed",
                  !locked &&
                    !current &&
                    !completed &&
                    "hover:border-white/20",
                )}
              >
                <div
                  className={cn(
                    "h-12 w-12 shrink-0 rounded-full grid place-items-center relative z-10 shadow-lg",
                    completed
                      ? "bg-brand-tertiary text-white"
                      : current
                        ? "bg-brand-primary text-white animate-pulse-soft"
                        : locked
                          ? "bg-zinc-800 text-zinc-500"
                          : "bg-brand-primary/20 text-brand-primary border border-brand-primary/40",
                  )}
                >
                  {completed ? (
                    <Check className="h-5 w-5" aria-hidden />
                  ) : locked ? (
                    <Lock className="h-5 w-5" aria-hidden />
                  ) : (
                    <Icon className="h-5 w-5" aria-hidden />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-ink truncate">
                      {lesson.title}
                    </p>
                    {completed && <Badge variant="success">Done</Badge>}
                    {current && <Badge variant="brand">Up next</Badge>}
                  </div>
                  <p className="text-xs text-muted mt-0.5 line-clamp-1">
                    {lesson.summary}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold gradient-text">
                    +{lesson.xpReward} XP
                  </div>
                  <div className="text-[11px] text-muted">
                    {lesson.exercises.length} drills
                  </div>
                </div>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
