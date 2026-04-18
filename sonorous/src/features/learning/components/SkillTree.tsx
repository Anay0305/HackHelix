import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Hand,
  Users,
  Hash,
  Utensils,
  HelpCircle,
  Smile,
  Calendar,
  Map as MapIcon,
  HeartPulse,
  Briefcase,
  Lock,
  Check,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { Lesson } from "@/api/types";
import { useLearningStore } from "@/store";
import { skillTreeLayout, SKILL_TREE_VIEWBOX } from "../data/skillTreeLayout";
import { cn } from "@/lib/cn";

const iconMap: Record<string, LucideIcon> = {
  hand: Hand,
  users: Users,
  hash: Hash,
  utensils: Utensils,
  "help-circle": HelpCircle,
  smile: Smile,
  calendar: Calendar,
  map: MapIcon,
  "heart-pulse": HeartPulse,
  briefcase: Briefcase,
};

interface Props {
  lessons: Lesson[];
}

type NodeState = "locked" | "available" | "current" | "completed";

const NODE_R = 5.2; // in viewBox units

export function SkillTree({ lessons }: Props) {
  const completedIds = useLearningStore((s) => s.completedLessonIds);
  const lessonScores = useLearningStore((s) => s.lessonScores);
  const firstIncomplete = lessons.find((l) => !completedIds.includes(l.id));

  const nodes = useMemo(
    () =>
      lessons.map((lesson) => {
        const layout = skillTreeLayout[lesson.id] ?? { x: 50, y: 50 };
        const completed = completedIds.includes(lesson.id);
        const prereqsMet = lesson.prerequisiteIds.every((p) =>
          completedIds.includes(p),
        );
        const current = lesson.id === firstIncomplete?.id && prereqsMet;
        const state: NodeState = completed
          ? "completed"
          : current
            ? "current"
            : prereqsMet
              ? "available"
              : "locked";
        return { lesson, layout, state };
      }),
    [lessons, completedIds, firstIncomplete],
  );

  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="relative w-full">
      {/* Desktop / tablet constellation */}
      <div className="hidden sm:block">
        <ConstellationView
          nodes={nodes}
          lessonScores={lessonScores}
          hovered={hovered}
          setHovered={setHovered}
        />
      </div>

      {/* Mobile: vertical path with new node language */}
      <div className="sm:hidden">
        <MobilePath nodes={nodes} lessonScores={lessonScores} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Desktop view — SVG constellation
// ────────────────────────────────────────────────────────────────────────────

function ConstellationView({
  nodes,
  lessonScores,
  hovered,
  setHovered,
}: {
  nodes: { lesson: Lesson; layout: { x: number; y: number }; state: NodeState }[];
  lessonScores: ReturnType<typeof useLearningStore.getState>["lessonScores"];
  hovered: string | null;
  setHovered: (id: string | null) => void;
}) {
  const { w, h } = SKILL_TREE_VIEWBOX;

  // Depth of each node from a root (no-prereq lesson) — used to stagger edge growth.
  const depthById = useMemo(() => {
    const map = new Map<string, number>();
    const byId = new Map(nodes.map((n) => [n.lesson.id, n.lesson]));
    const resolve = (id: string): number => {
      if (map.has(id)) return map.get(id)!;
      const lesson = byId.get(id);
      if (!lesson || lesson.prerequisiteIds.length === 0) {
        map.set(id, 0);
        return 0;
      }
      const d = 1 + Math.max(...lesson.prerequisiteIds.map(resolve));
      map.set(id, d);
      return d;
    };
    nodes.forEach((n) => resolve(n.lesson.id));
    return map;
  }, [nodes]);

  // Build list of edges (prerequisite -> lesson), with per-edge geometry and depth.
  const edges = nodes.flatMap(({ lesson, layout }, nIdx) =>
    lesson.prerequisiteIds.map((pid, pIdx) => {
      const from = skillTreeLayout[pid];
      if (!from) return null;
      const to = layout;
      const fromDone = nodes.find((n) => n.lesson.id === pid)?.state === "completed";
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      // Alternate curvature direction per edge for organic variety.
      const curlSign = (nIdx + pIdx) % 2 === 0 ? 1 : -1;
      const curlAmount = 0.1 + ((nIdx * 31 + pIdx) % 5) * 0.012;
      const cx = midX + -dy * curlAmount * curlSign;
      const cy = midY + dx * curlAmount * curlSign;
      const len = Math.hypot(dx, dy);
      return {
        id: `${pid}->${lesson.id}`,
        d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`,
        active: fromDone,
        depth: depthById.get(lesson.id) ?? 0,
        length: len,
      };
    }),
  ).filter(Boolean) as {
    id: string;
    d: string;
    active: boolean;
    depth: number;
    length: number;
  }[];

  const maxDepth = Math.max(1, ...edges.map((e) => e.depth));

  return (
    <div
      className="relative w-full rounded-xl2 overflow-hidden border border-white/5"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(139,92,246,0.18), transparent 55%), radial-gradient(ellipse at bottom right, rgba(236,72,153,0.12), transparent 50%), #0b0a12",
        aspectRatio: "5 / 7",
        maxHeight: "min(880px, 80vh)",
      }}
    >
      {/* Starfield */}
      <Starfield />

      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id="edge-active" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#C084FC" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#EC4899" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="edge-pulse" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0" />
            <stop offset="45%" stopColor="#FDE68A" stopOpacity="1" />
            <stop offset="55%" stopColor="#F472B6" stopOpacity="1" />
            <stop offset="100%" stopColor="#F472B6" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="node-current-glow">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </radialGradient>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="edge-bloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges — render in two passes: inactive first (behind), active on top */}
        {edges
          .filter((e) => !e.active)
          .map((e) => {
            const delay = 0.3 + e.depth * 0.18;
            return (
              <motion.path
                key={e.id}
                d={e.d}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={0.22}
                strokeLinecap="round"
                strokeDasharray="0.8 1.6"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  pathLength: { duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] },
                  opacity: { duration: 0.5, delay },
                }}
              />
            );
          })}

        {edges
          .filter((e) => e.active)
          .map((e) => {
            const delay = 0.25 + e.depth * 0.22;
            const duration = 0.6 + Math.min(e.length / 40, 0.8);
            // Estimate path length for dash animation (Q curve length ~ hypot distance)
            const approxLen = e.length * 1.05;
            return (
              <g key={e.id}>
                {/* Soft underglow */}
                <motion.path
                  d={e.d}
                  fill="none"
                  stroke="url(#edge-active)"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  strokeOpacity={0.25}
                  filter="url(#edge-bloom)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.45 }}
                  transition={{
                    pathLength: { duration, delay, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.5, delay: delay + duration * 0.4 },
                  }}
                />
                {/* Main crisp line */}
                <motion.path
                  d={e.d}
                  fill="none"
                  stroke="url(#edge-active)"
                  strokeWidth={0.5}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    pathLength: { duration, delay, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: 0.3, delay },
                  }}
                />
                {/* Flowing energy pulse — travels along the path forever */}
                <motion.path
                  d={e.d}
                  fill="none"
                  stroke="url(#edge-pulse)"
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  strokeDasharray={`${approxLen * 0.18} ${approxLen}`}
                  initial={{ strokeDashoffset: approxLen, opacity: 0 }}
                  animate={{
                    strokeDashoffset: -approxLen,
                    opacity: [0, 1, 1, 0],
                  }}
                  transition={{
                    strokeDashoffset: {
                      duration: 2.4,
                      delay: delay + duration,
                      repeat: Infinity,
                      ease: "linear",
                    },
                    opacity: {
                      duration: 2.4,
                      delay: delay + duration,
                      times: [0, 0.1, 0.9, 1],
                      repeat: Infinity,
                    },
                  }}
                />
              </g>
            );
          })}

        {/* Nodes — delay each by its depth so it blooms after its incoming edge */}
        {nodes.map(({ lesson, layout, state }, i) => {
          const Icon = iconMap[lesson.iconKey] ?? Hand;
          const score = lessonScores[lesson.id];
          const depth = depthById.get(lesson.id) ?? 0;
          return (
            <SkillNode
              key={lesson.id}
              x={layout.x}
              y={layout.y}
              index={i}
              depth={depth}
              state={state}
              Icon={Icon}
              stars={score?.stars ?? 0}
              onEnter={() => setHovered(lesson.id)}
              onLeave={() => setHovered(null)}
              lessonId={lesson.id}
            />
          );
        })}
      </svg>

      {/* Tooltip overlay (positioned via foreignObject-like absolute div) */}
      <AnimatePresence>
        {hovered && (() => {
          const node = nodes.find((n) => n.lesson.id === hovered);
          if (!node) return null;
          const left = `${node.layout.x}%`;
          const top = `${node.layout.y}%`;
          const score = lessonScores[node.lesson.id];
          return (
            <motion.div
              key={hovered}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              className="absolute pointer-events-none z-10"
              style={{
                left,
                top,
                transform: "translate(-50%, calc(-100% - 36px))",
              }}
            >
              <div className="rounded-lg glass px-3 py-2 text-xs whitespace-nowrap shadow-xl border border-white/15">
                <p className="font-semibold text-ink">{node.lesson.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-muted">
                  <span className="gradient-text font-semibold">
                    +{node.lesson.xpReward} XP
                  </span>
                  <span>·</span>
                  <span>{node.lesson.exercises.length} drills</span>
                </div>
                {score && score.stars > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-3 w-3",
                          i < score.stars
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted/40",
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Legend */}
      <div className="absolute bottom-3 right-3 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted/80 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/5">
        <LegendDot color="#8B5CF6" label="Current" pulse />
        <LegendDot color="#10B981" label="Done" />
        <LegendDot color="#52525B" label="Locked" />
      </div>
    </div>
  );
}

function LegendDot({
  color,
  label,
  pulse,
}: {
  color: string;
  label: string;
  pulse?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn("h-2 w-2 rounded-full", pulse && "animate-pulse")}
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Node
// ────────────────────────────────────────────────────────────────────────────

function SkillNode({
  x,
  y,
  index,
  depth,
  state,
  Icon,
  stars,
  onEnter,
  onLeave,
  lessonId,
}: {
  x: number;
  y: number;
  index: number;
  depth: number;
  state: NodeState;
  Icon: LucideIcon;
  stars: number;
  onEnter: () => void;
  onLeave: () => void;
  lessonId: string;
}) {
  const navigate = useNavigate();
  const locked = state === "locked";
  const completed = state === "completed";
  const current = state === "current";
  // Bloom after the incoming edge finishes drawing.
  const nodeDelay = 0.25 + depth * 0.22 + 0.55;

  const color =
    state === "completed"
      ? "#10B981"
      : state === "current"
        ? "#8B5CF6"
        : state === "available"
          ? "#C026D3"
          : "#27272A";

  // Wrap nodes in a link; locked nodes are no-op
  const content = (
    <g>
      {/* Pulse ring for current */}
      {current && (
        <motion.circle
          cx={x}
          cy={y}
          r={NODE_R + 1.5}
          fill="url(#node-current-glow)"
          animate={{ r: [NODE_R + 1, NODE_R + 4, NODE_R + 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      {/* Outer ring */}
      <motion.circle
        cx={x}
        cy={y}
        r={NODE_R + 0.6}
        fill="none"
        stroke={color}
        strokeOpacity={locked ? 0.3 : 0.6}
        strokeWidth={0.35}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: nodeDelay, type: "spring", stiffness: 180, damping: 14 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />

      {/* Solid body */}
      <motion.circle
        cx={x}
        cy={y}
        r={NODE_R}
        fill={locked ? "#18181B" : color}
        fillOpacity={locked ? 0.6 : completed ? 0.95 : 0.22}
        stroke={color}
        strokeWidth={0.4}
        filter="url(#soft-glow)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: nodeDelay + 0.06, type: "spring", stiffness: 180, damping: 14 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />

      {/* Icon */}
      <foreignObject
        x={x - NODE_R}
        y={y - NODE_R}
        width={NODE_R * 2}
        height={NODE_R * 2}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <div className="w-full h-full flex items-center justify-center">
          {locked ? (
            <Lock className="h-[11px] w-[11px] text-zinc-500" />
          ) : completed ? (
            <Check className="h-[12px] w-[12px] text-white" />
          ) : (
            <Icon
              className={cn(
                "h-[12px] w-[12px]",
                current ? "text-white" : "text-brand-primary",
              )}
            />
          )}
        </div>
      </foreignObject>

      {/* Stars for completed */}
      {completed && stars > 0 && (
        <g transform={`translate(${x - 3}, ${y + NODE_R + 1.2})`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <polygon
              key={i}
              transform={`translate(${i * 2.2}, 0)`}
              points="1,0 1.3,0.7 2,0.75 1.45,1.2 1.6,2 1,1.55 0.4,2 0.55,1.2 0,0.75 0.7,0.7"
              fill={i < stars ? "#FBBF24" : "rgba(255,255,255,0.15)"}
            />
          ))}
        </g>
      )}
    </g>
  );

  return (
    <g
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => {
        if (!locked) navigate(`/learn/${lessonId}`);
      }}
      style={{ cursor: locked ? "not-allowed" : "pointer" }}
      role={locked ? undefined : "button"}
      aria-label={locked ? `${lessonId} (locked)` : `Open ${lessonId} lesson`}
    >
      {/* Invisible click target for easier interaction */}
      <circle
        cx={x}
        cy={y}
        r={NODE_R + 2}
        fill="transparent"
        pointerEvents="all"
      />
      {content}
    </g>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Starfield background
// ────────────────────────────────────────────────────────────────────────────

const STARS = Array.from({ length: 40 }).map((_, i) => ({
  id: i,
  top: Math.random() * 100,
  left: Math.random() * 100,
  size: Math.random() * 1.4 + 0.4,
  delay: Math.random() * 3,
  duration: 2 + Math.random() * 3,
}));

function Starfield() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {STARS.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
          }}
          animate={{ opacity: [0.1, 0.7, 0.1] }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Mobile fallback — vertical path using the new node language
// ────────────────────────────────────────────────────────────────────────────

function MobilePath({
  nodes,
  lessonScores,
}: {
  nodes: { lesson: Lesson; layout: { x: number; y: number }; state: NodeState }[];
  lessonScores: ReturnType<typeof useLearningStore.getState>["lessonScores"];
}) {
  return (
    <div className="relative py-4">
      <div
        aria-hidden
        className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-gradient-to-b from-brand-purple/40 via-brand-purple/10 to-transparent"
      />
      <ul className="space-y-5 relative">
        {nodes.map(({ lesson, state }, i) => {
          const Icon = iconMap[lesson.iconKey] ?? Hand;
          const locked = state === "locked";
          const completed = state === "completed";
          const current = state === "current";
          const score = lessonScores[lesson.id];
          const align = i % 2 === 0 ? "left" : "right";

          return (
            <motion.li
              key={lesson.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                "relative flex items-center gap-3",
                align === "right" && "flex-row-reverse",
              )}
            >
              <Link
                to={locked ? "#" : `/learn/${lesson.id}`}
                onClick={(e) => locked && e.preventDefault()}
                aria-disabled={locked}
                className={cn(
                  "relative z-[1] h-14 w-14 rounded-full grid place-items-center shrink-0 shadow-lg transition-all",
                  completed && "bg-emerald-500 text-white",
                  current && "bg-brand-primary text-white animate-pulse-soft ring-4 ring-brand-primary/30",
                  state === "available" && "bg-brand-primary/20 text-brand-primary border-2 border-brand-primary/60",
                  locked && "bg-zinc-800 text-zinc-500 opacity-60",
                )}
              >
                {locked ? (
                  <Lock className="h-5 w-5" />
                ) : completed ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                {completed && score && score.stars > 0 && (
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5 bg-black/70 rounded-full px-1.5 py-0.5">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className={cn(
                          "h-2.5 w-2.5",
                          idx < score.stars
                            ? "fill-amber-400 text-amber-400"
                            : "text-white/25",
                        )}
                      />
                    ))}
                  </div>
                )}
              </Link>
              <div
                className={cn(
                  "flex-1 glass rounded-xl2 px-3 py-2",
                  current && "border-brand-purple/40 shadow-glow-brand",
                  locked && "opacity-50",
                )}
              >
                <p className="font-semibold text-sm text-ink">{lesson.title}</p>
                <p className="text-[11px] text-muted truncate">
                  +{lesson.xpReward} XP · {lesson.exercises.length} drills
                </p>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
