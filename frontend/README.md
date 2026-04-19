# Sonorous — Frontend

Bi-directional Indian Sign Language translation PWA for Hack Helix 2026.

This repo is a **frontend-only scaffold** with all 5 product pillars fully built:

1. **UDID Auth & Setup** — Government Disability ID onboarding.
2. **Bi-Directional Simulator** — Speech ↔ ISL with 3D avatar + webcam recognition.
3. **Gamified Learning** — Duolingo-style ISL roadmap with exercises.
4. **Govt. Benefits Aggregator** — Subsidies tailored by UDID category.
5. **Developer Debugger** — Live WebSocket telemetry for judges.

All backend calls are mocked via **MSW** so the UI is 100% interactive standalone.

---

## Run locally

```bash
pnpm install        # or: npm install
pnpm dev            # or: npm run dev
```

Open http://localhost:5173 and hit **"Use demo UDID"** on the login screen.

```bash
pnpm build          # type-check + production build
pnpm preview        # preview production build
pnpm lint           # lint
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript strict |
| Routing | react-router-dom v6 |
| Styling | Tailwind CSS + CVA (indigo/slate design tokens) |
| State | Zustand + persist (5 slices) |
| 3D | three + @react-three/fiber + drei |
| Async | @tanstack/react-query |
| Forms | react-hook-form + zod |
| Mocks | MSW v2 for REST + custom mock WebSocket |
| Animation | framer-motion |
| Icons | lucide-react |
| Toasts | sonner |
| PWA | vite-plugin-pwa |

---

## Project structure

```
src/
├── api/            REST + WebSocket clients, shared TypeScript contract (types.ts)
├── app/            Layouts, providers, ProtectedRoute
├── components/
│   ├── ui/         shadcn-style primitives (Button, Card, Drawer…)
│   └── common/     Sidebar, TopBar, EmptyState, ErrorBoundary…
├── features/       One folder per pillar
│   ├── auth/       Landing, Login, Onboarding
│   ├── simulator/  Avatar stage, mic/webcam, speech↔ISL panels
│   ├── learning/   Roadmap, lesson, 3 exercise types
│   ├── benefits/   List, filters, detail drawer
│   └── debugger/   Log terminal, metrics, payload inspector
├── store/          5 Zustand slices
├── mocks/          MSW handlers, mock WS, fixtures
└── lib/            cn, env, format helpers
```

---

## Backend handoff — what to implement

The full TypeScript contract lives in [`src/api/types.ts`](src/api/types.ts).
This is the **source of truth**. MSW handlers in [`src/mocks/handlers.ts`](src/mocks/handlers.ts)
and [`src/mocks/ws.ts`](src/mocks/ws.ts) implement it exactly — read those to see the shape of every payload.

### REST endpoints

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/api/auth/udid-verify` | `UdidVerifyRequest` | `UdidVerifyResponse` |
| GET | `/api/auth/me` | — | `MeResponse` |
| POST | `/api/auth/profile` | `UpdateProfileRequest` | `UserProfile` |
| GET | `/api/benefits?category&state&search` | — | `Benefit[]` |
| GET | `/api/benefits/:id` | — | `BenefitDetail` |
| GET | `/api/learning/curriculum` | — | `Lesson[]` |
| POST | `/api/learning/progress` | `ProgressSubmitRequest` | `ProgressSubmitResponse` |

Auth is bearer token in `Authorization` header; frontend reads/writes
`localStorage["sonorous:token"]`.

### WebSocket — `/ws/simulator`

Bi-directional JSON. Client → server: `ClientMsg`. Server → client: `ServerMsg`.

```ts
type ClientMsg =
  | { type: "start", mode: "speech2isl" | "isl2speech", sessionId: string }
  | { type: "audio_chunk", seq: number, pcm16Base64: string }
  | { type: "landmarks", seq: number, frame: HolisticFrame }
  | { type: "stop" }
  | { type: "ping", t: number };

type ServerMsg =
  | { type: "transcript", partial: boolean, text: string, confidence: number, timestampMs: number }
  | { type: "gloss", tokens: GlossToken[], sentiment, sourceText: string }
  | { type: "avatar_cue", clip: string, morphTargets?, durationMs: number }
  | { type: "tts_ready", audioUrl: string, captions: string }
  | { type: "log", level, msg, latencyMs, meta? }
  | { type: "pong", t: number }
  | { type: "error", code: string, msg: string };
```

Target latency: **<500ms** from audio start to first `gloss` message.

### Flipping off mocks

Set `VITE_USE_MSW=false` in `.env` and point `VITE_API_BASE` + `VITE_WS_URL`
at your backend. That's it — nothing else changes.

---

## Demo scenarios

Append `?mock-scenario=<id>` to the simulator URL to pick a canned script:

- `coffee` — ordering at a café (sentiment: happy)
- `directions` — asking for train station (neutral)
- `emergency` — calling a doctor (urgent — triggers intense facial morphs)
- `classroom` — classroom greeting (happy)
- `hospital` — hospital intake (neutral)
- `cycle` — cycles through all scenarios on each new session

---

## What's mocked vs real

| Feature | Real | Mocked |
|---|---|---|
| Mic capture + waveform | ✅ Web Audio API | — |
| Webcam preview | ✅ getUserMedia | — |
| MediaPipe landmark overlay | — | ✅ animated dots for demo |
| STT, gloss translation, TTS | — | ✅ canned scenarios |
| Avatar rig | — | ✅ procedural Three.js placeholder (RPM .glb drops in later) |
| UDID verification | — | ✅ accepts any valid-shape UDID |
| Benefits database | — | ✅ 25 real schemes from Indian govt |
| Lessons curriculum | — | ✅ 10 lessons × 2–3 exercises |

---

## Accessibility

- WCAG AA contrast (indigo `#3730A3` on white: 9.8:1)
- Keyboard-reachable everywhere (tab through simulator without a mouse)
- `prefers-reduced-motion` respected — kills idle breathing + framer-motion
- Captions on every TTS utterance
- Avatar has aria-hidden; transcript is aria-live

---

## PWA

Installable on Android Chrome / iOS Safari / desktop. Service worker caches
app shell + avatar asset. Check DevTools → Application → Manifest.

---

Built over 24 hours for Hack Helix 2026 • Human Augmentation & Assistive Systems track.
