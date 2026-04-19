# HackHelix — CLAUDE.md

## What This Project Is

HackHelix is a real-time accessibility layer for audio calls that serves deaf users. When a hearing person speaks on an audio call, their speech is converted to Indian Sign Language (ISL) and rendered as a Bitmoji-style 3D avatar on the deaf person's screen. The deaf person responds by signing (camera-based ISL recognition) or typing, which is converted to speech and sent back.

This is NOT a video call app. It is an audio-call client with a synthesized ISL overlay — no video stream from the hearing side.

---

## Architecture Overview

```
HEARING PERSON                          DEAF PERSON'S DEVICE
──────────────                          ─────────────────────
speaks → mic
    │
    ▼
[WebRTC audio stream]
    │
    ▼ (backend intercepts)
Deepgram Streaming STT
    │
    ▼
ISL Grammar Engine (spaCy + Claude API)
    │ → SOV reorder
    │ → topic fronting
    │ → NMM flags
    ▼
ISL Gloss Sequence
    │
    ▼
Pose Lookup (iSign dataset / ISLRTC)
    │
    ▼
Ready Player Me Avatar animates signs    ← deaf person's full-screen UI
    (React Three Fiber, Three.js)

─────────────────────────────────────────────────────────────
DEAF PERSON responds:

Camera → MediaPipe pose → ISL classifier → text
    OR
Text input
    │
    ▼
ElevenLabs TTS → audio → WebRTC stream → hearing person hears
```

---

## Project Structure

```
HackHelix/
├── frontend/                    # React + Vite + Three.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── Avatar/          # Ready Player Me 3D avatar + ISL animation
│   │   │   ├── CallUI/          # Audio call controls (mute, end, switch mode)
│   │   │   └── ResponsePanel/   # Deaf user's response: camera ISL or text
│   │   ├── hooks/
│   │   │   ├── useWebRTC.ts     # WebRTC audio peer connection
│   │   │   ├── useDeepgram.ts   # Deepgram streaming STT socket
│   │   │   ├── useAvatarPose.ts # Drive RPM avatar bones from pose data
│   │   │   └── useMediaPipe.ts  # Camera-based ISL pose detection
│   │   ├── services/
│   │   │   ├── webrtc.ts        # WebRTC peer setup, signaling
│   │   │   ├── islPipeline.ts   # Gloss → pose → animation sequence
│   │   │   └── elevenlabs.ts    # TTS for deaf→hearing direction
│   │   ├── store/               # Zustand global state
│   │   └── main.tsx
│   ├── public/
│   │   └── avatar.glb           # Ready Player Me avatar (downloaded once)
│   └── package.json
│
├── backend/                     # FastAPI Python
│   ├── src/
│   │   ├── routes/
│   │   │   ├── call.py          # WebRTC signaling (offer/answer/ICE)
│   │   │   ├── isl.py           # Text → ISL gloss + pose endpoint
│   │   │   └── tts.py           # ElevenLabs TTS proxy
│   │   ├── services/
│   │   │   ├── deepgram_client.py   # Deepgram streaming WebSocket wrapper
│   │   │   ├── isl_grammar.py       # NLP: text → ISL gloss (spaCy + rules)
│   │   │   ├── isl_llm.py           # Claude API for complex sentence rewrite
│   │   │   ├── pose_lookup.py       # Gloss → MediaPipe landmark sequences
│   │   │   └── elevenlabs_client.py # ElevenLabs TTS wrapper
│   │   └── main.py
│   ├── data/
│   │   └── pose_db.json         # Pre-extracted: gloss → landmark keyframes
│   └── requirements.txt
│
├── datasets/                    # Dataset download + preprocessing scripts
│   ├── download_isign.py        # Pull iSign from HuggingFace
│   ├── extract_poses.py         # MediaPipe landmark extraction from videos
│   ├── build_pose_db.py         # Build pose_db.json lookup table
│   └── README.md
│
├── CLAUDE.md
└── README.md
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend framework | React + Vite + TypeScript | Fast dev, HMR |
| 3D rendering | React Three Fiber + Three.js | WebGL avatar in browser |
| Avatar | Ready Player Me GLB | Bitmoji-style, fully rigged, free |
| Audio call | WebRTC (native browser) | Peer-to-peer audio, no server relay |
| STT | Deepgram Nova-2 (streaming) | ~300ms latency, Hindi+English, cheap |
| ISL grammar NLP | spaCy (`en_core_web_trf`) + rule engine | Dependency parse for SOV/topic reorder |
| ISL gloss refinement | Claude API (`claude-sonnet-4-6`) | Few-shot for complex sentences |
| Pose data | iSign dataset (HuggingFace) + ISLRTC | ISL-specific MediaPipe landmarks |
| TTS (deaf→hearing) | ElevenLabs | Natural voice, streaming |
| ISL recognition | MediaPipe Holistic + classifier | Camera → sign → text |
| Backend | FastAPI + uvicorn | Async WebSocket support |
| State management | Zustand | Lightweight, no boilerplate |
| Styling | Tailwind CSS | Utility classes, fast UI |

---

## Key Datasets

### iSign (Primary — ISL poses)
- **HuggingFace**: `Exploration-Lab/iSign`
- 118,000+ video-sentence pairs for Indian Sign Language
- Tasks: Text2Pose, SignPose2Text, Word Prediction
- Used for: building `pose_db.json` (gloss → MediaPipe keyframe sequences)
- Download script: `datasets/download_isign.py`

### ISLRTC Dictionary (Sign lookup fallback)
- Source: `islrtc.nic.in` — official Government of India ISL dictionary
- 10,000+ signs as video clips
- Used for: extracting landmarks for words not in iSign
- Process: download videos → run MediaPipe Holistic → store landmark arrays

### CISLR (ISL Recognition — deaf→hearing direction)
- **ACL Anthology**: EMNLP 2022
- 7,050 ISL recognition videos
- Used for: training/evaluating the ISL classifier (camera → gloss → text)

---

## ISL Grammar Rules Implemented

The NLP pipeline transforms English/Hindi text into ISL gloss following these rules:

1. **SOV reorder** — move verb to end: "She drinks water" → `SHE WATER DRINK`
2. **Topic fronting** — discourse topic goes first: "What did you eat?" → `YOU EAT WHAT`
3. **Drop function words** — remove articles (a, an, the), auxiliaries (is, are, was), copula
4. **Negation movement** — NOT moves clause-finally: "He is not a doctor" → `HE DOCTOR NOT`
5. **Question NMM flag** — tag yes/no questions for raised-eyebrow animation
6. **Negation NMM flag** — tag negative sentences for head-shake animation
7. **Tense markers** — add TIME-PAST / TIME-FUTURE signs at sentence start instead of inflection

---

## ISL Grammar Engine — Code Location

- Rule-based: `backend/src/services/isl_grammar.py`
- LLM fallback: `backend/src/services/isl_llm.py` (Claude API, few-shot)
- Prompt template for Claude: see `isl_llm.py` — includes ISL grammar rules + 10 example pairs

---

## Avatar Animation System

- Avatar format: GLB (Ready Player Me full-body, ~5MB)
- Skeleton: standard humanoid rig (Mixamo-compatible bone names)
- Pose data format: array of frames, each frame = 33 body + 21 left hand + 21 right hand landmarks (x, y, z normalized)
- Animation driver: `useAvatarPose.ts` maps landmark positions to bone rotations via inverse kinematics
- Co-articulation: linear interpolation between sign keyframe sequences (4 frames transition)
- NMM: head bone + facial morph targets for eyebrows (question) and head rotation (negation)

---

## Dev Commands

```bash
# Frontend
cd frontend
npm install
npm run dev          # http://localhost:5173

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000

# Dataset pipeline (run once before first use)
cd datasets
python download_isign.py      # downloads iSign subset from HuggingFace
python extract_poses.py       # runs MediaPipe on downloaded videos
python build_pose_db.py       # builds backend/data/pose_db.json
```

---

## Environment Variables

```
# backend/.env
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
ANTHROPIC_API_KEY=
FRONTEND_URL=http://localhost:5173

# frontend/.env
VITE_BACKEND_URL=http://localhost:8000
VITE_DEEPGRAM_API_KEY=        # used client-side for direct streaming
```

---

## WebRTC Signaling Flow

```
Hearing device          Backend (signaling)         Deaf device
──────────────          ───────────────────         ──────────
POST /call/offer   ──►  store offer, return id
                                                GET /call/{id}/offer
                        return offer        ◄──
                                                POST /call/{id}/answer
POST /call/{id}/answer ◄── forward answer
[ICE candidates exchange via /call/{id}/ice]
[peer connection established — audio only]
```

Deepgram intercepts the audio track on the backend after the hearing person's stream arrives. The deaf person's browser never receives raw audio — only the avatar pose data (sent via WebSocket from backend).

---

## Known Limitations / Simplifications

- Spatial grammar loci: simplified to 2-locus system (first NP = left, second NP = right)
- Classifier predicates: not implemented — skipped in gloss generation
- ISL recognition (deaf→hearing): MVP uses text input + TTS; camera-based ISL recognition is a stretch goal
- Vocabulary: demo restricted to ~500 high-frequency signs from iSign + ISLRTC
- Fingerspelling fallback: for words not in pose_db.json, individual letter handshapes are played

---

## Do Not

- Do not add video stream from the hearing side — this is audio-only by design
- Do not use Whisper (too slow for real-time, expensive) — use Deepgram
- Do not translate ISL word-for-word — always run through the grammar engine
- Do not commit API keys — use .env files only
