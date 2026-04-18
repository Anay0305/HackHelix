/**
 * Sonorous API Contract
 * =====================
 * Single source of truth for the backend developer.
 * Every REST endpoint and WebSocket message is defined here.
 * MSW mocks in src/mocks/ implement this contract exactly.
 */

// ─── Domain ──────────────────────────────────────────────────────────────

export type DisabilityCategory =
  | "hearing"
  | "speech"
  | "visual"
  | "locomotor"
  | "multiple"
  | "other";

export interface User {
  id: string;
  udid: string;
  displayName: string;
  email?: string;
  disabilityCategory: DisabilityCategory;
  state: string;
  createdAt: string; // ISO
}

export interface UserProfile {
  preferredLanguage: "en" | "hi" | "bilingual";
  notifications: {
    benefitUpdates: boolean;
    lessonReminders: boolean;
    emergencyAlerts: boolean;
  };
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
    fontScale: number; // 1.0 = default
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────

export interface UdidVerifyRequest {
  udid: string;
}
export interface UdidVerifyResponse {
  token: string;
  user: User;
  isNewUser: boolean;
}

export interface MeResponse {
  user: User;
  profile: UserProfile | null;
}

export interface UpdateProfileRequest {
  displayName?: string;
  preferredLanguage?: UserProfile["preferredLanguage"];
  notifications?: Partial<UserProfile["notifications"]>;
  accessibility?: Partial<UserProfile["accessibility"]>;
}

// ─── Benefits ────────────────────────────────────────────────────────────

export type BenefitCategory =
  | "financial"
  | "transport"
  | "education"
  | "employment"
  | "healthcare"
  | "housing"
  | "tax";

export type BenefitTier = "central" | "state" | "private";

export interface Benefit {
  id: string;
  title: string;
  summary: string;
  category: BenefitCategory;
  tier: BenefitTier;
  state?: string; // e.g. "Maharashtra" or undefined for central
  eligibleCategories: DisabilityCategory[];
  estimatedValue?: string; // e.g. "75% concession" or "₹12,000/year"
  applyUrl?: string;
  tags: string[];
}

export interface BenefitDetail extends Benefit {
  description: string;
  requiredDocuments: string[];
  applicationSteps: string[];
  contact?: {
    department: string;
    phone?: string;
    email?: string;
  };
}

// ─── Learning ────────────────────────────────────────────────────────────

export type ExerciseKind = "watch-and-pick" | "sign-along" | "fill-sentence";

export interface ExerciseOption {
  id: string;
  label: string;
  correct?: boolean;
}

export interface Exercise {
  id: string;
  kind: ExerciseKind;
  prompt: string;
  signClip?: string; // animation clip name
  options?: ExerciseOption[]; // for watch-and-pick
  glossTokens?: string[]; // for fill-sentence (shuffle client-side)
  targetOrder?: string[]; // for fill-sentence (correct ISL order)
}

export interface Lesson {
  id: string;
  unit: number;
  order: number;
  title: string;
  summary: string;
  iconKey: string;
  xpReward: number;
  prerequisiteIds: string[];
  exercises: Exercise[];
}

export interface ProgressSubmitRequest {
  lessonId: string;
  score: number; // 0..1
  completedAt: string;
}
export interface ProgressSubmitResponse {
  xp: number;
  streakDays: number;
  newUnlocks: string[];
}

// ─── Simulator WebSocket ─────────────────────────────────────────────────

export type SimulatorMode = "speech2isl" | "isl2speech";

export type ClientMsg =
  | { type: "start"; mode: SimulatorMode; sessionId: string }
  | { type: "audio_chunk"; seq: number; pcm16Base64: string }
  | { type: "landmarks"; seq: number; frame: HolisticFrame }
  | { type: "stop" }
  | { type: "ping"; t: number };

export type ServerMsg =
  | {
      type: "transcript";
      partial: boolean;
      text: string;
      confidence: number;
      timestampMs: number;
    }
  | {
      type: "gloss";
      tokens: GlossToken[];
      sentiment?: "neutral" | "happy" | "urgent" | "sad";
      sourceText: string;
    }
  | {
      type: "avatar_cue";
      clip: string;
      morphTargets?: Record<string, number>;
      durationMs: number;
    }
  | {
      type: "tts_ready";
      audioUrl: string;
      captions: string;
    }
  | {
      type: "log";
      level: "info" | "warn" | "error";
      msg: string;
      latencyMs: number;
      meta?: unknown;
    }
  | { type: "pong"; t: number }
  | { type: "error"; code: string; msg: string };

export interface GlossToken {
  gloss: string;
  startMs: number;
  endMs: number;
}

export interface HolisticFrame {
  pose: number[];
  leftHand: number[];
  rightHand: number[];
  face: number[];
}

// ─── API error shape (consistent across REST) ────────────────────────────

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
