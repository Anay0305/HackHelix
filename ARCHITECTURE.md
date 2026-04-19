# HackHelix — Technical Architecture Report

---

## Overview

HackHelix (branded **Sonorous**) is a real-time bidirectional ISL accessibility platform. It bridges communication between deaf users and hearing users via a React frontend, a FastAPI WebSocket backend, and a 3D avatar rendering pipeline. There is **no video stream** from the hearing side — only audio is received; the deaf user sees a synthesized avatar.

---

## System Architecture Map

```
HEARING PERSON                    BACKEND                       DEAF PERSON
──────────────                    ───────                       ────────────
Browser Mic
  → PCM16 audio
  → WS audio_chunk          → Deepgram nova-3 STT
                            → Groq Llama ISL gloss
                            → Pose lookup
                            → SpeechBrain emotion       → pose_sequence
                                                        → avatar_cue
                                                        → Three.js avatar renders signs

Webcam
  → MediaPipe Holistic                                  → landmarks WS
                            → LSTM / rule classifier
                            → gloss_to_sentence (Groq)
                            → ElevenLabs TTS            → tts_ready → Audio.play()
                                                → hearing partner hears response
```

---

## Backend

### Entry Point: `backend/src/main.py`

FastAPI app with CORS open to all origins. On startup, pre-warms SpeechBrain (emotion model) and YAMNet (sound detection) in background threads via `asyncio.to_thread` so first requests don't stall.

Registers 7 routers:

| Router | Path | Purpose |
|---|---|---|
| `simulator` | `/ws/simulator` | Primary single-user WS — both modes |
| `call_ws` | `/ws/call/{room}` | Two-party relayed call |
| `hear` | `/ws/hear` | Frame-by-frame gloss stream |
| `isl_pose` | `/isl/pose`, `/isl/pose/text` | REST pose lookup |
| `isl_recognition` | `/ws/isl` | Standalone ISL recognizer |
| `monitor` | `/ws/monitor` | Background sound alert service |
| `stt` | `/ws/stt` | Raw Deepgram STT proxy |

---

### Primary Endpoint: `/ws/simulator`

This is the main engine. Handles both modes with the same connection.

#### Mode 1: `speech2isl` (Hearing → Deaf)

```
{type:"start", mode:"speech2isl", sampleRate?}
  → opens Deepgram nova-3 streaming (linear16, endpointing 300ms, multilingual)

{type:"audio_chunk", pcm16Base64}
  → piped to Deepgram
  → accumulated in audio_buffer (for emotion, needs ≥0.5s)
  → accumulated in yamnet_buffer (fires every ~2s = 48000 × 2 × 2 bytes)

Deepgram fires on_transcript (is_final=true)
  → handle_final_transcript(text)
```

`handle_final_transcript` pipeline (sequential, all results streamed as they complete):

```
1. SpeechBrain wav2vec2-IEMOCAP on audio_buffer
   → resample 48kHz→16kHz via librosa
   → 4 emotion classes: neu/hap/ang/sad
   → morph targets: brow_raise (happy), brow_lower (angry/sad)
   → WS: {type:"emotion", emotion, intensity, morphTargets}

2. Groq llama-3.3-70b text_to_gloss(text)
   → 6 ISL grammar rules applied via few-shot prompt (29 examples, Hindi+English+Hinglish)
   → rules: SOV reorder, topic fronting, drop function words, negation-finally, tense markers, uppercase
   → WS: {type:"gloss", tokens:[{gloss,startMs,endMs}], sentiment, sourceText}
   → WS: {type:"transcript", partial:false, text, confidence, timestampMs}

3. get_pose(word) for each gloss token
   → priority: pose_db.json (iSign-extracted) → BUILTIN_POSES (47 hardcoded) → 2-frame fallback
   → each SignFrame: {body:[33 pts], rightHand:[21 pts], leftHand:[21 pts]}
   → WS: {type:"pose_sequence", words:[{word, frames}], msPerFrame:400}

4. Merge NMM + emotion morph targets
   → WS: {type:"avatar_cue", clip, morphTargets, durationMs}
```

#### Mode 2: `isl2speech` (Deaf → Hearing)

```
{type:"landmarks", frame:{pose:[], leftHand:[], rightHand:[], face:[]}}
  (all flat [x,y,z,x,y,z,...] arrays)
  → unflatten to [[x,y,z]×N]
  → frame_window.append() — capped at FRAME_WINDOW_MAX=24

classify_sequence_scored(frame_window) fires when len≥8 and not in cooldown:
  → LSTM first (conf≥0.55):
      normalize: subtract wrist, scale by middle-MCP distance, flatten 21pts → 63-dim
      resample window to seq_len via linspace
      model.predict → argmax → LSTM_LABELS
  → fallback: majority vote of per-frame rule-based classifier
      5 extension ratios + pinch distance → 13 hand shapes

if new sign detected (conf≥0.30, not duplicate):
  sign_buffer.append(sign)
  WS: {type:"transcript", partial:true, text:sign, confidence}
  schedules flush_buffer() after 1.5s silence

flush_buffer():
  gloss_to_sentence(tokens) → Groq Llama (10 ISL→English few-shot examples)
  synthesize(sentence) → ElevenLabs eleven_turbo_v2 → base64 data URL
  WS: {type:"tts_ready", audioUrl, captions}
```

**Key constants:**

```
HOLD_DURATION     = 0.5s
SILENCE_TIMEOUT   = 1.5s
MOVEMENT_THRESH   = 0.04  (landmark delta, detects held signs)
FRAME_WINDOW_MAX  = 24 frames
YAMNET_TRIGGER    = ~2s of audio at 48kHz stereo PCM16
```

---

### Two-Party Call: `/ws/call/{room_id}`

```
POST /call/room       → creates 6-char room ID → {roomId, createdAt}
GET  /call/room/{id}  → {hearingConnected, deafConnected, ...}
WS   /ws/call/{id}?role=hearing|deaf
```

In-memory `rooms` dict. Each room: `{hearing: WebSocket|None, deaf: WebSocket|None}`.

**Hearing side** runs the same pipeline as speech2isl — `text_to_gloss()` + `get_pose()` — but broadcasts `gloss`, `pose_sequence`, `avatar_cue` to **both** parties.

**Deaf side** runs the same pipeline as isl2speech — `classify_sequence_scored()` + `gloss_to_sentence()` + ElevenLabs — but `tts_ready` is sent to the **hearing partner**.

Partner events: `{type:"partner_joined"}` / `{type:"partner_left"}` when either side connects or disconnects.

---

### REST Pose API: `/isl/pose`

```
GET  /isl/pose?words=HELLO,ME,WATER
POST /isl/pose/text  body:{text}  →  text_to_gloss() first, then same
```

Response: `{gloss:[], words:[{word, frames:[{rs,re,rw,ls,le,lw,rightHand,leftHand}]}], msPerFrame:400}`

`_extract_arm()` maps body landmark indices: shoulder=11/12, elbow=13/14, wrist=15/16.

Used by the learning feature to animate the avatar during lessons.

---

### Other WebSocket Endpoints

**`/ws/hear`** — streaming gloss for a text input; sends `{type:"gloss"}` then streams one `{type:"frame"}` per word at 0.55s intervals.

**`/ws/isl`** — standalone sign recognizer; detects sign holds via movement threshold over 0.5s, flushes on 1.5s silence, sends `gloss_to_sentence()` + ElevenLabs audio.

**`/ws/monitor`** — dedicated sound alert service:
- Client streams PCM16 audio chunks
- YAMNet (TF Hub) runs every 1s on rolling 2s window
- 27 class-to-alertType mappings; 4s debounce per alertType to avoid spam
- 8 alert types: `fire_alarm`, `doorbell`, `horn`, `siren`, `phone`, `alarm`, `bell`, `baby_cry`
- Sends `{type:"alert", alertType, confidence, label, timestampMs}`

**`/ws/stt`** — raw Deepgram nova-3 proxy; piped binary WebSocket → transcript JSON.

---

### ML Services

#### Sign Classifier (`sign_classifier.py`)

Two-tier classification:

**Tier 1 — LSTM** (when model loaded):
1. Normalize: subtract wrist (pt[0]), divide by wrist→middle-MCP distance (pt[9])
2. Flatten 21 landmarks × 3 = **63-dim** feature vector
3. Resample frame window to `seq_len` (metadata-driven, now 30) via linspace
4. `model.predict(arr[None,...])` → softmax → threshold 0.55
5. Label lookup from `lstm_labels.json`

**Tier 2 — Rule-based** (fallback, always available):
- 5 extension ratios: `tip_dist / mcp_dist` from wrist
- 13 hand shapes with thresholds: HELLO, STOP, YES, YOU, UNDERSTAND, GOOD, OKAY, WANT, THANK_YOU, ME, HELP, WATER, KNOW
- Sequence: majority vote across frames, weighted by per-frame confidence

#### ISL Grammar (`isl_grammar.py`)

`text_to_gloss(text)` — Groq `llama-3.3-70b-versatile`, max_tokens=150. System prompt encodes 6 ISL grammar rules with 29 bilingual few-shot examples. Returns `{gloss:["SIGN1","SIGN2",...], nmm:"question"|"negation"|"none"}`. Falls back to split+uppercase on JSON parse failure.

#### Sentence Former (`sentence_former.py`)

`gloss_to_sentence(tokens)` — same Groq model, 10 ISL→English few-shot examples, max_tokens=100. Reverses SOV back to natural English SVO.

#### Pose Lookup (`pose_lookup.py`)

Priority chain for `get_pose(word)`:
1. `pose_db.json` — averaged poses from iSign dataset (39 words, 8 frames each)
2. `BUILTIN_POSES` — 47 hardcoded signs (hand shape + arm position descriptors)
3. 2-frame generic fallback

#### ElevenLabs (`elevenlabs_client.py`)

`synthesize(text)` → raw MP3 bytes. Model `eleven_turbo_v2`, voice configurable via env. Settings: stability=0.5, similarity_boost=0.75.

#### SpeechBrain Emotion (`emotion_merger.py`)

`analyze_audio_sync(pcm16_bytes, src_sr=48000)` → resample→16kHz via librosa, write temp WAV, classify via `wav2vec2-IEMOCAP`. Returns `{emotion, intensity, morphTargets:{brow_raise|brow_lower:float}}`. Optional DeepFace face emotion (face wins unless neutral/fear/disgust).

---

## Frontend

### Entry + Routing

**`main.tsx`** — optionally starts MSW mock worker (`VITE_USE_MSW=true`), then mounts React root.

**`App.tsx`** — `QueryClientProvider` → `Toaster` (Sonner) → `RouterProvider`.

**`router.tsx`** routes:

```
/                   LandingPage (unauthenticated shell)
/login              LoginPage
/onboarding         OnboardingPage

/simulator          SimulatorPage        ← main feature
/monitor            SoundMonitorPage
/call               CallLandingPage
/call/:roomId       CallPage
/learn              LearnHomePage
/learn/:lessonId    LessonPage
/benefits           BenefitsPage
/debug              DebuggerPage
/settings           SettingsPage
```

All routes under `/simulator` and above are behind `ProtectedRoute` which checks `authStore.token`.

---

### WebSocket Client (`api/socket.ts`)

`SimulatorSocket` class:
- Auto-reconnect with exponential backoff: 1s → 10s max
- `send(msg: ClientMsg)` — typed, queues when closed
- `on(type, listener)` / `off(type, listener)` — per-message-type pub/sub
- `getSocket()` returns the app-wide singleton; `setSocketImpl()` allows injection (used in tests)
- Connects to `env.wsUrl` (derived from `VITE_WS_URL` or `ws://{host}/ws/simulator`)

---

### Zustand Stores

#### `simulatorStore` (no persist)

The central runtime state. Key fields:

```
mode: "speech2isl" | "isl2speech"
isLive: boolean
wsStatus: WsStatus
transcripts: TranscriptChunk[]        // capped 30
glossTokens: GlossToken[]
poseSequence: PoseSequence | null     // drives avatar
avatarCue: AvatarCue | null           // morph targets + clip
emotion: EmotionState | null
alert: AlertState | null              // sound monitor alert
recognized: string                    // latest ISL sign text
ttsHistory: TtsHistoryItem[]          // capped 5
latencyMs: number
```

`PoseSequence`: `{words:[{word, frames:[{rs,re,rw,ls,le,lw,rightHand,leftHand}]}], msPerFrame, startedAt}`

#### `authStore` (persisted: `sonorous:auth`)

`user`, `profile`, `token`, `hasCompletedOnboarding`. `setAuth()` also writes `localStorage["sonorous:token"]` for REST client consumption.

#### `learningStore` (persisted: `sonorous:learning`)

`xp`, `streakDays`, `completedLessonIds`, `hearts` (max 5), `heartRefillAt`, `dailyXpLog`, `quests`, `questsChestClaimed`. Heart regeneration: 1 per 20 minutes. 3 daily quest types: drills (target 3, xp 15), highScore (target 2, xp 15), cameraPractice (target 1, xp 20).

#### `soundMonitorStore` (partial persist v3: `sonorous:soundMonitor`)

`isLive`, `wsStatus`, `alerts[]` (50 in memory, 20 persisted), `muted: Record<AlertType, boolean>`, `vibration: Record<AlertType, number[]>` — 8 default patterns, e.g. fire_alarm → `[400,100,400,100,400,100,400]`.

#### `debuggerStore` (no persist)

`logs[]` (500 cap), `lastPayload`, `confidenceHistory[]` (60 pts), `latencyHistory[]` (60 pts). Fed by `useSimulatorSocket` which pushes every incoming WS message.

---

### Simulator Feature

**`useSimulatorSocket.ts`** — mounts once on `SimulatorPage`, subscribes to all socket message types, dispatches to `simulatorStore` and `debuggerStore`. Auto-plays TTS via `new Audio(url).play()` with `speechSynthesis` fallback. Alert auto-dismiss after 8s.

**`useMicCapture.ts`**:
- `getUserMedia` → `AudioContext` → `ScriptProcessorNode(4096)` → `float32ToPcm16()` → base64 → `{type:"audio_chunk"}`
- `AnalyserNode` for level metering (RAF loop, `getByteFrequencyData`)
- Returns `{isRecording, level, sampleRate, start, stop}`

**`useWebcamCapture.ts`**:
- Lazy-loads `@mediapipe/holistic` from CDN (v0.5.1675471629) on first call
- `modelComplexity:1`, `smoothLandmarks:true`
- `flattenLandmarks()`: `[x,y,z,x,y,z,...]` per landmark group
- Sends `{type:"landmarks", frame:HolisticFrame}` at **15fps** (66ms min interval) when hand detected
- Returns `{videoRef, isActive, start, stop}`

**`SpeechToIslPanel`** — input modes: text textarea / voice mic / media file. Shows transcript + confidence, animated gloss tokens, sentiment badge, mounts `AvatarStage`.

**`IslToSpeechPanel`** — input modes: live webcam / video upload / photo upload / gloss text. `AlertBanner` for sound monitor alerts. TTS history list with playback buttons.

---

### Avatar System

Three avatar implementations, selected by capability:

#### 1. `PoseDrivenAvatar` (GLB + live pose data)

Activated when `env.rpmAvatarUrl` is set and GLB loads successfully.

- `useGLTF` + `useAnimations` (drei)
- Every frame, `resolveCurrentFrame()` computes `wordIndex` and `frameIndex` from elapsed time
- `pointBone(bone, worldTarget, lerpSpeed)`:
  ```
  localDir = bone.parent.worldToLocal(worldTarget) + WORLD_Z_BIAS(0.18)
  quaternion = setFromUnitVectors(LOCAL_Y, localDir.normalize())
  bone.quaternion.slerp(quaternion, lerpSpeed)
  ```
- Bone mapping: `RightArm`, `RightForeArm`, `RightHand`, `LeftArm`, `LeftForeArm`, `LeftHand`, `Head`
- `LERP_ACTIVE=0.25`, `LERP_IDLE=0.06`
- Idle head sway: sin at 0.9Hz + 0.6Hz

#### 2. `ProceduralAvatar` (pure Three.js geometry, no GLB needed)

Fallback when GLB fails. Built from capsules/spheres/boxes in code.

- Arms: `armRotX(dy) = clamp(4.8*dy - 1.62, -3.1, 0.30)`
- Elbow bend: cross/dot product of 2D upper/lower arm vectors
- Finger curl: `(tip.y - mcp.y) / 0.12 + 0.30`
- Breathing: `root.position.y = sin(t*1.2) * 0.015`
- NMM head-shake (negation): `sin(t*12.5) * 0.23 radians`
- Brow raise (question NMM / happy emotion): `brow.position.y += 0.04`

#### 3. `RPMAvatar` (ReadyPlayerMe clip playback)

Uses GLB animation clips by name. ARKit blendshape presets for 4 sentiments. Blink every 2-5s (closes 0.12s). Morph targets smoothed at `delta * 9` per frame.

#### `FingerspellOverlay`

Falls back to letter-by-letter spelling at 220ms/letter when clip not found in GLB. AnimatePresence fade in/out.

---

### Sound Monitor Feature

`useSoundMonitor` opens a **dedicated** WebSocket to `/ws/monitor` (separate from simulator socket). Does **not** close on component unmount — intentionally persists across page navigation.

On alert: `pushAlert()` → Sonner toast → `navigator.vibrate(pattern)` (Android Chrome only, requires HTTPS/localhost).

---

### Learning Feature

**`LearnHomePage`**: fetches curriculum via React Query (`queryKey:["curriculum"]`), renders `RoadmapTree` with prerequisite locking. Sidebar shows hearts, daily quests, streak, XP ring, activity heatmap.

**`LessonPage`**: 3 exercise types:
- `WatchAndPick` — avatar signs target word (loop via `useLessonPose`), user picks from options
- `FillSentence` — token bank, drag-to-order, checked against `targetOrder`
- `SignAlong` — avatar demonstrates, self-assessed

XP formula: `round(lesson.xpReward * max(accuracy, 0.6))` — minimum 60% of reward.

Wrong answer: `loseHeart()`. Zero hearts: redirect to `/learn`.

**`useLessonPose`**: `GET {backendUrl}/isl/pose?words=...` → `setPoseSequence()` + re-fetches in a loop after `(totalFrames * msPerFrame + 800ms)` to keep avatar looping. Cleans up `setPoseSequence(null)` on unmount.

---

### Debugger Feature

4 tabs at `/debug`:

| Tab | Content |
|---|---|
| Logs | Terminal-style WS log, filter + autoscroll, 500-entry cap |
| Payloads | JSON inspector of last received WS message |
| Metrics | SVG sparklines for latency + confidence (p50/p95/p99 computed) |
| Camera | Full pipeline debugger — own WS, MediaPipe inline, finger bars, classification history, sign buffer, raw message log |

Camera tab computes finger extension ratios client-side mirroring backend Python: `TIP_IDS=[4,8,12,16,20]`, `MCP_IDS=[2,5,9,13,17]`, `tip_dist(wrist)/mcp_dist(wrist)`. Color: green >1.5 (extended), amber 1.1–1.5 (partial), red <1.1 (curled).

---

## Data Flow Diagrams

### Speech → ISL Avatar (speech2isl)

```
Browser Mic (PCM16)
  → ScriptProcessorNode
  → base64 encode
  → WS {type:"audio_chunk"}
  → /ws/simulator
  → dg_connection.send()
  → Deepgram nova-3 streaming STT
  → on_transcript callback
  → WS {type:"transcript", partial:false}
  → handle_final_transcript(text)
    ├── SpeechBrain emotion → WS {type:"emotion"}
    ├── Groq Llama text_to_gloss()
    │   → WS {type:"gloss", tokens, sentiment}
    ├── pose_lookup.get_pose() per word
    │   → WS {type:"pose_sequence", words, msPerFrame:400}
    └── WS {type:"avatar_cue", clip, morphTargets}

Browser receives pose_sequence
  → simulatorStore.setPoseSequence()
  → PoseDrivenAvatar.resolveCurrentFrame()
  → pointBone() per arm bone per frame
  → Three.js render loop
```

### ISL → Speech (isl2speech)

```
Webcam
  → MediaPipe Holistic (CDN WASM)
  → flattenLandmarks()
  → WS {type:"landmarks", frame:HolisticFrame}
  → /ws/simulator
  → _unflatten() right/left hand
  → frame_window.append() (max 24 frames)
  → classify_sequence_scored() if ≥8 frames
    ├── LSTM inference (conf≥0.55)
    └── Fallback: majority vote of rule-based
  → sign_buffer.append(sign)
  → WS {type:"transcript", partial:true, text:sign}
  → flush_buffer() after 1.5s silence
    ├── gloss_to_sentence(tokens) via Groq Llama
    └── ElevenLabs synthesize()
        → WS {type:"tts_ready", audioUrl, captions}

Browser receives tts_ready
  → new Audio(audioUrl).play()
  → simulatorStore.appendTts()
```

### Two-Party Call

```
Hearing User                    Deaf User
────────────                    ─────────
Browser Mic                     Browser Webcam
  → audio_chunk                   → landmarks
  → /ws/call/{room}?role=hearing  → /ws/call/{room}?role=deaf
  → Deepgram STT                  → classify_sequence_scored()
  → text_to_gloss()               → sign_buffer
  → get_pose() per word           → flush_signs() after 1.5s
  → gloss+pose_sequence           → gloss_to_sentence()
    +avatar_cue                   → ElevenLabs synthesize()
    → sent to BOTH sides          → tts_ready to HEARING partner
```

---

## Dataset Pipeline

```
download_isign.py   → HuggingFace Exploration-Lab/iSign
                      39-word whitelist, max 5 videos/gloss
                      → datasets/videos/<GLOSS>/<n>.mp4

extract_poses.py    → MediaPipe HolisticLandmarker (VIDEO mode)
                      → datasets/poses/<GLOSS>/<n>.json
                      [{body:[33 pts], rightHand:[21 pts], leftHand:[21 pts]}×~30 frames]

build_pose_db.py    → average across all videos per gloss, 8 frame slots
                      → backend/data/pose_db.json

collect_webcam.py   → MediaPipe Tasks API HandLandmarker, 30 frames @ 15fps
                      SPACE=record, R=redo, Q=quit
                      → datasets/poses/<SIGN>/webcam_<n>.json

train_lstm.py       → normalize (wrist-centred, scale by middle-MCP)
                      → 63-dim per frame, resample to 30 frames
                      → LSTM(64)→LSTM(128)→LSTM(64)→Dense(64)→Dense(n)
                      → backend/models/lstm_sign.h5 + lstm_labels.json
```

---

## End-to-End Latency Budget

### speech2isl

| Stage | Typical |
|---|---|
| Deepgram nova-3 STT | ~300ms (streaming, endpointing 300ms) |
| Groq Llama gloss | ~400ms |
| Pose lookup (DB hit) | <5ms |
| SpeechBrain emotion | ~200ms |
| **Total to first avatar frame** | **~900ms–1.2s** |

### isl2speech

| Stage | Typical |
|---|---|
| MediaPipe WASM (client) | realtime |
| Sign buffer + silence wait | 1.5s |
| Groq sentence former | ~300ms |
| ElevenLabs TTS | ~500ms |
| **Total to audio playback** | **~1.8–2.5s** |

---

## Key Design Decisions

1. **No video from hearing side** — audio-only by design; avatar is synthesized, not streamed
2. **MediaPipe runs client-side** — WASM in browser for ISL capture; no camera frames sent to server
3. **Two-tier classifier** — LSTM for accuracy, rule-based as instant fallback with no load delay
4. **Sound monitor is persistent** — doesn't close on page nav; background service pattern
5. **Pose DB over real-time synthesis** — pre-averaged iSign poses for speed; LLM only handles grammar, not animation
6. **Groq for all LLM calls** — `llama-3.3-70b-versatile` for both `text_to_gloss` and `gloss_to_sentence`; same model, different prompts

---

## Environment Variables

### Backend

```
GROQ_API_KEY          Groq LLM + Whisper STT
DEEPGRAM_API_KEY      Deepgram streaming STT
DEEPGRAM_LANGUAGE     default "multi" (nova-3 code-switching)
ELEVENLABS_API_KEY    ElevenLabs TTS
ELEVENLABS_VOICE_ID   default Rachel voice
YAMNET_DEBUG          "1" to print top-5 YAMNet predictions
```

### Frontend

```
VITE_USE_MSW          "true" to enable MSW mocking
VITE_DEMO_MODE        "1" for demo mode
VITE_API_BASE         default "/api"
VITE_BACKEND_URL      HTTP base URL
VITE_WS_URL           WebSocket URL (default: ws://{host}/ws/simulator)
VITE_RPM_AVATAR_URL   ReadyPlayerMe GLB URL (enables PoseDrivenAvatar)
```

---

## Dependencies

### Backend (key)

| Package | Purpose |
|---|---|
| `fastapi` + `uvicorn` | HTTP + WebSocket server |
| `groq` | llama-3.3-70b ISL grammar + sentence former |
| `deepgram-sdk` | nova-3 streaming STT |
| `speechbrain` | wav2vec2-IEMOCAP audio emotion |
| `tensorflow` + `tensorflow-hub` | YAMNet sound detection |
| `librosa` | audio resampling |
| `mediapipe` | server-side pose extraction (dataset pipeline) |
| `deepface` | optional facial emotion |

### Frontend (key)

| Package | Purpose |
|---|---|
| `react` + `vite` + `typescript` | UI framework |
| `@tanstack/react-query` | REST data fetching + caching |
| `zustand` | global state management |
| `react-router-dom` v6 | client-side routing |
| `three` + `@react-three/fiber` + `@react-three/drei` | 3D avatar rendering |
| `framer-motion` | UI animations |
| `@mediapipe/holistic` | browser WASM hand/pose detection |
| `msw` | Mock Service Worker (dev/test) |
| `sonner` | toast notifications |
| `canvas-confetti` | lesson completion animation |
