import type { GlossToken } from "@/api/types";

export interface GlossScenario {
  id: string;
  label: string;
  sentiment: "neutral" | "happy" | "urgent" | "sad";
  sourceText: string;
  transcriptChunks: { text: string; confidence: number }[];
  tokens: GlossToken[];
  avatarCues: { clip: string; durationMs: number }[];
}

/**
 * Canned bi-directional scripts for the demo.
 * Each scenario corresponds to a realistic situation. MSW WS handler
 * picks one based on ?mock-scenario URL param or cycles them.
 */
export const glossScenarios: GlossScenario[] = [
  {
    id: "coffee",
    label: "Ordering coffee",
    sentiment: "happy",
    sourceText: "Hello, I would like one coffee please.",
    transcriptChunks: [
      { text: "Hello", confidence: 0.92 },
      { text: "Hello, I would", confidence: 0.94 },
      { text: "Hello, I would like one coffee please", confidence: 0.96 },
    ],
    tokens: [
      { gloss: "HELLO", startMs: 0, endMs: 600 },
      { gloss: "I", startMs: 600, endMs: 1000 },
      { gloss: "COFFEE", startMs: 1000, endMs: 1600 },
      { gloss: "ONE", startMs: 1600, endMs: 2000 },
      { gloss: "WANT", startMs: 2000, endMs: 2500 },
      { gloss: "PLEASE", startMs: 2500, endMs: 3000 },
    ],
    avatarCues: [
      { clip: "hello", durationMs: 600 },
      { clip: "point-self", durationMs: 400 },
      { clip: "coffee", durationMs: 600 },
      { clip: "one", durationMs: 400 },
      { clip: "want", durationMs: 500 },
      { clip: "please", durationMs: 500 },
    ],
  },
  {
    id: "directions",
    label: "Asking directions",
    sentiment: "neutral",
    sourceText: "Excuse me, where is the railway station?",
    transcriptChunks: [
      { text: "Excuse me", confidence: 0.89 },
      { text: "Excuse me, where is", confidence: 0.91 },
      { text: "Excuse me, where is the railway station", confidence: 0.95 },
    ],
    tokens: [
      { gloss: "EXCUSE-ME", startMs: 0, endMs: 700 },
      { gloss: "TRAIN", startMs: 700, endMs: 1200 },
      { gloss: "STATION", startMs: 1200, endMs: 1800 },
      { gloss: "WHERE", startMs: 1800, endMs: 2400 },
    ],
    avatarCues: [
      { clip: "excuse-me", durationMs: 700 },
      { clip: "train", durationMs: 500 },
      { clip: "station", durationMs: 600 },
      { clip: "where", durationMs: 600 },
    ],
  },
  {
    id: "emergency",
    label: "Emergency help",
    sentiment: "urgent",
    sourceText: "I need help, please call a doctor immediately!",
    transcriptChunks: [
      { text: "I need help", confidence: 0.88 },
      { text: "I need help, please", confidence: 0.93 },
      { text: "I need help, please call a doctor immediately", confidence: 0.97 },
    ],
    tokens: [
      { gloss: "HELP", startMs: 0, endMs: 500 },
      { gloss: "I", startMs: 500, endMs: 800 },
      { gloss: "NEED", startMs: 800, endMs: 1200 },
      { gloss: "DOCTOR", startMs: 1200, endMs: 1800 },
      { gloss: "CALL", startMs: 1800, endMs: 2300 },
      { gloss: "NOW", startMs: 2300, endMs: 2700 },
    ],
    avatarCues: [
      { clip: "help-urgent", durationMs: 500 },
      { clip: "point-self", durationMs: 300 },
      { clip: "need", durationMs: 400 },
      { clip: "doctor", durationMs: 600 },
      { clip: "call", durationMs: 500 },
      { clip: "now", durationMs: 400 },
    ],
  },
  {
    id: "classroom",
    label: "Classroom greeting",
    sentiment: "happy",
    sourceText: "Good morning teacher, I am ready for the lesson.",
    transcriptChunks: [
      { text: "Good morning", confidence: 0.93 },
      { text: "Good morning teacher", confidence: 0.95 },
      { text: "Good morning teacher, I am ready for the lesson", confidence: 0.96 },
    ],
    tokens: [
      { gloss: "MORNING", startMs: 0, endMs: 600 },
      { gloss: "GOOD", startMs: 600, endMs: 1000 },
      { gloss: "TEACHER", startMs: 1000, endMs: 1600 },
      { gloss: "I", startMs: 1600, endMs: 1900 },
      { gloss: "READY", startMs: 1900, endMs: 2400 },
      { gloss: "LESSON", startMs: 2400, endMs: 3000 },
    ],
    avatarCues: [
      { clip: "morning", durationMs: 600 },
      { clip: "good", durationMs: 400 },
      { clip: "teacher", durationMs: 600 },
      { clip: "point-self", durationMs: 300 },
      { clip: "ready", durationMs: 500 },
      { clip: "lesson", durationMs: 600 },
    ],
  },
  {
    id: "hospital",
    label: "Hospital intake",
    sentiment: "neutral",
    sourceText: "My name is Arjun, I have a fever since yesterday.",
    transcriptChunks: [
      { text: "My name is Arjun", confidence: 0.91 },
      { text: "My name is Arjun, I have", confidence: 0.93 },
      { text: "My name is Arjun, I have a fever since yesterday", confidence: 0.96 },
    ],
    tokens: [
      { gloss: "NAME", startMs: 0, endMs: 500 },
      { gloss: "MY", startMs: 500, endMs: 800 },
      { gloss: "ARJUN", startMs: 800, endMs: 1500 },
      { gloss: "YESTERDAY", startMs: 1500, endMs: 2000 },
      { gloss: "FEVER", startMs: 2000, endMs: 2500 },
      { gloss: "I", startMs: 2500, endMs: 2800 },
    ],
    avatarCues: [
      { clip: "name", durationMs: 500 },
      { clip: "my", durationMs: 300 },
      { clip: "fingerspell", durationMs: 700 },
      { clip: "yesterday", durationMs: 500 },
      { clip: "fever", durationMs: 500 },
      { clip: "point-self", durationMs: 300 },
    ],
  },
];

export function pickScenario(id?: string | null): GlossScenario {
  if (!id) return glossScenarios[Math.floor(Math.random() * glossScenarios.length)];
  return glossScenarios.find((s) => s.id === id) ?? glossScenarios[0];
}
