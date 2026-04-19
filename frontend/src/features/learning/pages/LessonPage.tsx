import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronRight, Sparkles, Star } from "lucide-react";
import confetti from "canvas-confetti";
import { restClient } from "@/api/rest";
import { useLearningStore } from "@/store";
import { starsFor } from "@/store/learningStore";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { AvatarStage } from "@/features/simulator/components/avatar/AvatarStage";
import { HeartsBar } from "../components/HeartsBar";
import { useLessonPose } from "../hooks/useLessonPose";
import { cn } from "@/lib/cn";
import type { Exercise } from "@/api/types";

const CORRECT_PHRASES = ["Nice!", "Good work", "Yes!", "Correct!", "On it!", "Exactly"];
const WRONG_PHRASES = ["Not quite", "Almost", "So close", "Try again"];
function randomPhrase<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const completeLesson = useLearningStore((s) => s.completeLesson);
  const awardXp = useLearningStore((s) => s.awardXp);
  const loseHeart = useLearningStore((s) => s.loseHeart);
  const hearts = useLearningStore((s) => s.hearts);
  const progressQuest = useLearningStore((s) => s.progressQuest);

  const { data: lessons } = useQuery({
    queryKey: ["curriculum"],
    queryFn: () => restClient.getCurriculum(),
  });
  const lesson = lessons?.find((l) => l.id === lessonId);

  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [correct, setCorrect] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);

  if (!lesson) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <p className="text-muted">Lesson not found.</p>
      </div>
    );
  }

  const exercise = lesson.exercises[exerciseIdx];
  const progress = (exerciseIdx + (finished ? 1 : 0)) / lesson.exercises.length;

  function onComplete(wasCorrect: boolean) {
    // Per-drill quest + heart logic
    progressQuest("drills", 1);
    if (wasCorrect) {
      progressQuest("highScore", 1);
      setCorrect((c) => [...c, exerciseIdx]);
    } else {
      const had = loseHeart();
      if (!had) {
        toast.error("Out of hearts", {
          description: "Hearts refill over time — try again soon.",
        });
        navigate("/learn");
        return;
      }
    }
    if (exerciseIdx < lesson!.exercises.length - 1) {
      setExerciseIdx((i) => i + 1);
    } else {
      setFinished(true);
      const score =
        (correct.length + (wasCorrect ? 1 : 0)) / lesson!.exercises.length;
      const xp = Math.round(lesson!.xpReward * Math.max(score, 0.6));
      completeLesson(lesson!.id, score);
      awardXp(xp);
      toast.success(`Lesson complete \u2022 +${xp} XP`, {
        description: `${correct.length + (wasCorrect ? 1 : 0)} of ${
          lesson!.exercises.length
        } correct`,
      });
    }
  }

  return (
    <div className="min-h-full bg-surface text-ink">
      {/* Header */}
      <header className="sticky top-0 z-10 glass-subtle border-b border-white/5">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/learn")}
            aria-label="Back to lessons"
            className="h-10 w-10 grid place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink focus-ring"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs text-muted mb-1">
              <span>Unit {lesson.unit}</span>
              <span>\u2022</span>
              <span>{lesson.title}</span>
            </div>
            <Progress value={progress} />
          </div>
          <HeartsBar compact />
          <Badge variant="info">+{lesson.xpReward} XP</Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6">
        {finished ? (
          <FinishedScreen
            correct={correct.length}
            total={lesson.exercises.length}
            xp={Math.round(
              lesson.xpReward *
                Math.max(correct.length / lesson.exercises.length, 0.6),
            )}
            onContinue={() => navigate("/learn")}
          />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={exerciseIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <ExerciseView exercise={exercise} onComplete={onComplete} />
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}

function ExerciseView({
  exercise,
  onComplete,
}: {
  exercise: Exercise;
  onComplete: (correct: boolean) => void;
}) {
  if (exercise.kind === "watch-and-pick") {
    return <WatchAndPick exercise={exercise} onComplete={onComplete} />;
  }
  if (exercise.kind === "fill-sentence") {
    return <FillSentence exercise={exercise} onComplete={onComplete} />;
  }
  return <SignAlong exercise={exercise} onComplete={onComplete} />;
}

function WatchAndPick({
  exercise,
  onComplete,
}: {
  exercise: Exercise;
  onComplete: (correct: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const correctId = exercise.options?.find((o) => o.correct)?.id;

  // Drive the avatar to sign the target word on loop while the user decides.
  useLessonPose(exercise.signClip ? [exercise.signClip] : undefined, true);

  function submit() {
    if (!selected) return;
    const isRight = selected === correctId;
    if (isRight) toast.success(randomPhrase(CORRECT_PHRASES));
    else toast.error(randomPhrase(WRONG_PHRASES), { description: "The avatar signed differently." });
    setTimeout(() => onComplete(isRight), 600);
  }

  return (
    <div className="grid md:grid-cols-[1fr_0.9fr] gap-5">
      <div className="h-[360px] md:h-auto md:min-h-[420px]">
        <AvatarStage />
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-purple">
            Watch & Pick
          </p>
          <h2 className="text-xl font-semibold mt-1">{exercise.prompt}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {exercise.options?.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className={cn(
                "rounded-xl2 border-2 px-4 py-5 text-sm font-medium text-left transition-all",
                selected === opt.id
                  ? "border-brand-purple/60 bg-gradient-brand-soft shadow-glow"
                  : "border-white/10 hover:border-white/20 bg-white/5",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button size="lg" disabled={!selected} onClick={submit}>
          Check answer <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FillSentence({
  exercise,
  onComplete,
}: {
  exercise: Exercise;
  onComplete: (correct: boolean) => void;
}) {
  const [available, setAvailable] = useState<string[]>(() =>
    [...(exercise.glossTokens ?? [])].sort(() => Math.random() - 0.5),
  );
  const [assembled, setAssembled] = useState<string[]>([]);

  useEffect(() => {
    setAvailable(
      [...(exercise.glossTokens ?? [])].sort(() => Math.random() - 0.5),
    );
    setAssembled([]);
  }, [exercise.id]);

  function pick(t: string) {
    setAvailable((a) => a.filter((x) => x !== t));
    setAssembled((a) => [...a, t]);
  }
  function unpick(t: string) {
    setAssembled((a) => a.filter((x) => x !== t));
    setAvailable((a) => [...a, t]);
  }

  function check() {
    const target = exercise.targetOrder ?? [];
    const ok = assembled.length === target.length &&
      assembled.every((t, i) => t === target[i]);
    if (ok) toast.success("Perfect ISL order!");
    else toast.error(randomPhrase(WRONG_PHRASES), { description: `Expected: ${target.join(" \u2192 ")}` });
    setTimeout(() => onComplete(ok), 700);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-purple">
          Fill the Sentence
        </p>
        <h2 className="text-xl font-semibold mt-1">{exercise.prompt}</h2>
        <p className="text-sm text-muted mt-1">
          ISL uses Subject-Object-Verb order. Tap tokens to build the sentence.
        </p>
      </div>

      {/* Assembled */}
      <div className="min-h-[72px] rounded-xl2 border-2 border-dashed border-white/15 glass p-3 flex flex-wrap gap-2">
        {assembled.length === 0 ? (
          <span className="text-sm text-muted italic self-center mx-auto">
            Tap tokens below to assemble.
          </span>
        ) : (
          assembled.map((t, i) => (
            <button
              key={`${t}-${i}`}
              onClick={() => unpick(t)}
              className="px-3 py-2 rounded-lg bg-gradient-brand-soft border border-brand-purple/40 text-ink font-mono font-medium hover:border-brand-purple/60 focus-ring"
            >
              {t}
            </button>
          ))
        )}
      </div>

      {/* Bank */}
      <div className="flex flex-wrap gap-2">
        {available.map((t, i) => (
          <button
            key={`${t}-${i}`}
            onClick={() => pick(t)}
            className="px-3 py-2 rounded-lg glass font-mono font-medium text-ink hover:border-brand-purple/50 focus-ring"
          >
            {t}
          </button>
        ))}
      </div>

      <Button
        size="lg"
        disabled={assembled.length !== (exercise.glossTokens?.length ?? 0)}
        onClick={check}
      >
        Check order
      </Button>
    </div>
  );
}

function SignAlong({
  exercise,
  onComplete,
}: {
  exercise: Exercise;
  onComplete: (correct: boolean) => void;
}) {
  const [attempted, setAttempted] = useState(false);

  // Loop the demonstrated sign so the user can watch it multiple times.
  useLessonPose(exercise.signClip ? [exercise.signClip] : undefined, true);

  return (
    <div className="grid md:grid-cols-[1fr_0.9fr] gap-5">
      <div className="h-[360px] md:h-auto md:min-h-[420px]">
        <AvatarStage />
      </div>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-purple">
            Sign Along
          </p>
          <h2 className="text-xl font-semibold mt-1">{exercise.prompt}</h2>
          <p className="text-sm text-muted mt-1">
            Watch the avatar, then tap &ldquo;I got it&rdquo; when you&apos;ve practised.
          </p>
        </div>

        {attempted ? (
          <div className="rounded-xl2 border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold">
              <Sparkles className="h-4 w-4" /> Well done!
            </div>
            <p className="text-muted mt-1">
              Real sign-quality scoring needs webcam recognition from the
              backend. For this demo, self-assessment is fine.
            </p>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setAttempted(false)}
            disabled={!attempted}
          >
            Watch again
          </Button>
          <Button
            onClick={() => {
              if (!attempted) {
                setAttempted(true);
              } else {
                onComplete(true);
              }
            }}
          >
            {attempted ? "I got it" : "Try it"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FinishedScreen({
  correct,
  total,
  xp,
  onContinue,
}: {
  correct: number;
  total: number;
  xp: number;
  onContinue: () => void;
}) {
  const accuracy = total === 0 ? 0 : correct / total;
  const stars = starsFor(accuracy);
  const [displayXp, setDisplayXp] = useState(0);
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;

    const fire = (ratio: number, opts: confetti.Options) => {
      confetti({
        particleCount: Math.floor(220 * ratio),
        spread: 70,
        origin: { y: 0.4 },
        colors: ["#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#60A5FA"],
        ...opts,
      });
    };
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.9 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });

    const start = performance.now();
    const duration = 1100;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayXp(Math.round(eased * xp));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [xp]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center pt-6 relative"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.1 }}
        className="mx-auto h-24 w-24 rounded-full bg-gradient-brand grid place-items-center text-white shadow-glow-brand"
      >
        <Check className="h-10 w-10" aria-hidden />
      </motion.div>

      <h1 className="font-display text-3xl font-semibold mt-6">
        Lesson complete!
      </h1>
      <p className="text-muted mt-2">
        You got {correct} of {total} correct.
      </p>

      <div className="mt-5 flex items-center justify-center gap-2">
        {Array.from({ length: 3 }).map((_, i) => {
          const earned = i < stars;
          return (
            <motion.div
              key={i}
              initial={{ scale: 0, rotate: -45, opacity: 0 }}
              animate={{
                scale: earned ? [0, 1.3, 1] : 1,
                rotate: 0,
                opacity: 1,
              }}
              transition={{
                delay: 0.35 + i * 0.18,
                duration: 0.5,
                type: "spring",
                stiffness: 180,
              }}
            >
              <Star
                className={cn(
                  "h-10 w-10 drop-shadow-lg",
                  earned
                    ? "fill-amber-400 text-amber-400"
                    : "fill-white/5 text-white/20",
                )}
                style={
                  earned
                    ? { filter: "drop-shadow(0 0 8px rgba(251,191,36,0.6))" }
                    : undefined
                }
              />
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-amber-300 font-semibold relative"
      >
        <Sparkles className="h-4 w-4" />
        <span>+{displayXp} XP earned</span>
        <motion.span
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], y: [-4, -48, -64] }}
          transition={{ duration: 1.6, delay: 0.6, ease: "easeOut" }}
          className="absolute -top-2 right-4 text-sm font-bold text-amber-300 pointer-events-none"
        >
          +{xp}
        </motion.span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3 }}
        className="mt-8"
      >
        <Button size="lg" onClick={onContinue}>
          Continue
        </Button>
      </motion.div>
    </motion.div>
  );
}

