# HackHelix

> Real-time Indian Sign Language synthesis layer for audio calls — making voice calls accessible to the deaf community.

---

## The Problem

India has ~18 million deaf individuals. When a hearing person calls a deaf person, there is no accessible real-time solution. Existing relay services are slow, expensive, and require a human interpreter. Indian Sign Language (ISL) is structurally distinct from both Hindi and English — it has its own grammar, spatial structure, and non-manual markers — making simple word-for-word translation useless.

---

## What HackHelix Does

HackHelix sits as an accessibility layer on top of a regular audio call:

**Hearing → Deaf:**
The hearing person speaks normally. On the deaf person's device, their speech is transcribed in real-time, converted to grammatically correct ISL gloss, and rendered as a Bitmoji-style 3D avatar that signs the message.

**Deaf → Hearing:**
The deaf person signs to their camera (or types). The ISL is recognized and converted to natural speech, which is transmitted as audio to the hearing person.

No interpreter needed. No video from the hearing side. Just a regular audio call made accessible.

---

## Demo Flow

```
Hearing person says: "Aapka naam kya hai?"
         │
         ▼
Deepgram STT → "What is your name?"
         │
         ▼
ISL Grammar Engine
  → drops "What is"
  → SOV reorder + topic fronting
  → output gloss: [YOU] [NAME] [WHAT] + [raised eyebrows NMM]
         │
         ▼
Pose lookup → MediaPipe landmark sequences for each sign
         │
         ▼
Ready Player Me avatar animates: YOU → NAME → WHAT
(with raised eyebrows throughout)
         │
         ▼
Deaf person reads the avatar on their screen
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEAF USER'S DEVICE                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Full-Screen Avatar UI (React)               │  │
│  │                                                          │  │
│  │        [Ready Player Me Bitmoji-style 3D Avatar]         │  │
│  │         animates ISL signs in real-time                  │  │
│  │                                                          │  │
│  │  ┌────────────────┐    ┌──────────────────────────────┐  │  │
│  │  │ 🎤 Call Status │    │  📷 Sign to Respond  OR      │  │  │
│  │  │ Hearing person │    │  ⌨️  Type your message       │  │  │
│  │  │ is speaking... │    │                              │  │  │
│  │  └────────────────┘    └──────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
            ▲ avatar pose data (WebSocket)          │ ISL / text
            │                                       ▼
┌───────────────────────────────────────────────────────────────┐
│                       BACKEND (FastAPI)                       │
│                                                               │
│  Deepgram STT ──► ISL Grammar Rules ──► Pose Lookup           │
│  (streaming)       (spaCy + Claude)     (iSign dataset)       │
│                                                               │
│  ElevenLabs TTS ◄── Text ◄── ISL Recognizer ◄── Camera Pose  │
└───────────────────────────────────────────────────────────────┘
            ▲ audio stream                 │ TTS audio
            │                             ▼
┌─────────────────────┐         ┌──────────────────────┐
│   HEARING PERSON    │◄────────│   WebRTC Audio Peer  │
│   (any device)      │         │   Connection         │
└─────────────────────┘         └──────────────────────┘
```

---

## ISL Grammar Engine

ISL is not English in hand form. The grammar engine handles:

| Rule | Example |
|---|---|
| SOV word order | "She drinks water" → `SHE WATER DRINK` |
| Topic-comment structure | "What did you eat?" → `YOU EAT WHAT` |
| Drop articles & auxiliaries | "The cat is sleeping" → `CAT SLEEP` |
| Clause-final negation | "He is not a doctor" → `HE DOCTOR NOT` |
| NMM: raised eyebrows | Yes/no questions — avatar raises eyebrows |
| NMM: head shake | Negation — avatar shakes head |
| Tense markers | Past → add `TIME-PAST` sign at start |

Complex or ambiguous sentences fall back to a Claude API call with a few-shot ISL grammar prompt.

---

## Datasets Used

### iSign — Primary ISL Dataset
- **Source**: [HuggingFace — Exploration-Lab/iSign](https://huggingface.co/datasets/Exploration-Lab/iSign)
- **Size**: 118,000+ video-sentence pairs
- **Used for**: Extracting MediaPipe pose landmark sequences for each ISL sign/phrase
- **Tasks**: Text2Pose (our primary task), SignPose2Text (deaf→hearing direction)
- **Paper**: iSign: A Benchmark for Indian Sign Language Processing (ACL 2024 Findings)

### ISLRTC Dictionary — Sign Lookup Fallback
- **Source**: Indian Sign Language Research and Training Centre (Govt. of India)
- **Size**: 10,000+ sign videos
- **Used for**: Landmark extraction for vocabulary not covered by iSign
- **Access**: `islrtc.nic.in`

### CISLR — ISL Recognition
- **Source**: EMNLP 2022 — Corpus for Indian Sign Language Recognition
- **Size**: 7,050 videos
- **Used for**: Training/evaluating the camera-based ISL → text classifier (stretch goal)
- **Paper**: CISLR (ACL Anthology 2022)

### Pose Database (built offline)
All three datasets are pre-processed into `backend/data/pose_db.json`:
```json
{
  "WATER": [
    [[x, y, z], ...],  // frame 1: 33 body + 42 hand landmarks
    [[x, y, z], ...]   // frame 2
  ],
  "NAME": [...],
  "YOU": [...]
}
```
This is a lookup table: gloss word → array of MediaPipe Holistic landmark frames.

---

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| 3D Avatar | React Three Fiber + Three.js |
| Avatar Model | Ready Player Me (GLB, Bitmoji-style) |
| Audio Call | WebRTC (native browser API) |
| Speech-to-Text | Deepgram Nova-2 (streaming WebSocket) |
| ISL Grammar NLP | spaCy + custom rule engine |
| LLM Fallback | Claude API (`claude-sonnet-4-6`) |
| Pose Data | iSign + ISLRTC + MediaPipe Holistic |
| Text-to-Speech | ElevenLabs streaming |
| ISL Recognition | MediaPipe Holistic + sign classifier |
| Backend | FastAPI + uvicorn |
| State | Zustand |
| Styling | Tailwind CSS |

---

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11+
- API keys: Deepgram, ElevenLabs, Anthropic

### 1. Clone and set up environment

```bash
git clone <repo>
cd HackHelix

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, ANTHROPIC_API_KEY

# Frontend
cd ../frontend
npm install
cp .env.example .env
# Fill in VITE_BACKEND_URL, VITE_DEEPGRAM_API_KEY
```

### 2. Build the pose database (one-time setup)

```bash
cd datasets
pip install -r requirements.txt
python download_isign.py       # Downloads iSign subset (~2GB) from HuggingFace
python extract_poses.py        # Runs MediaPipe Holistic on all videos
python build_pose_db.py        # Builds backend/data/pose_db.json
```

> **Shortcut for hackathon**: A pre-built `pose_db.json` for the 500 most common ISL signs is included in the repo at `backend/data/pose_db_500.json`. Copy it to `pose_db.json` to skip the dataset pipeline.

### 3. Run

```bash
# Terminal 1 — Backend
cd backend && uvicorn src.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open `http://localhost:5173` on two devices (or two browser tabs).
- Tab 1: Hearing person — click "Start Call as Hearing"
- Tab 2: Deaf person — click "Join as Deaf User"

Speak in Tab 1 → see the avatar sign in Tab 2.

---

## Project Structure

```
HackHelix/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Avatar/           # 3D avatar + ISL animation system
│   │   │   ├── CallUI/           # Call controls
│   │   │   └── ResponsePanel/    # Deaf user response (camera / text)
│   │   ├── hooks/
│   │   │   ├── useWebRTC.ts      # Audio peer connection
│   │   │   ├── useDeepgram.ts    # Streaming STT
│   │   │   ├── useAvatarPose.ts  # Bone-driving from landmark data
│   │   │   └── useMediaPipe.ts   # Camera pose detection
│   │   └── services/
│   │       ├── islPipeline.ts    # Gloss → animation sequence
│   │       └── elevenlabs.ts     # TTS
├── backend/
│   ├── src/
│   │   ├── routes/               # call.py, isl.py, tts.py
│   │   └── services/
│   │       ├── deepgram_client.py
│   │       ├── isl_grammar.py    # Rule-based grammar engine
│   │       ├── isl_llm.py        # Claude API fallback
│   │       ├── pose_lookup.py    # pose_db.json query
│   │       └── elevenlabs_client.py
│   └── data/
│       ├── pose_db.json          # Pre-extracted landmark sequences
│       └── pose_db_500.json      # 500-sign demo subset (included)
└── datasets/
    ├── download_isign.py
    ├── extract_poses.py
    └── build_pose_db.py
```

---

## Roadmap

### MVP (Hackathon)
- [x] Architecture + documentation
- [ ] WebRTC audio-only peer connection
- [ ] Deepgram streaming STT integration
- [ ] ISL grammar rule engine (spaCy)
- [ ] Pose lookup from pre-built database
- [ ] Ready Player Me avatar in Three.js
- [ ] Avatar bone animation from landmark data
- [ ] Basic NMMs (eyebrows for questions, head shake for negation)
- [ ] Text input → ElevenLabs TTS → audio (deaf→hearing path)

### Stretch Goals
- [ ] Camera-based ISL recognition (MediaPipe → classifier → text)
- [ ] Hindi speech input via IndicTrans2 translation
- [ ] Avatar customization UI (skin, hair, clothes via Ready Player Me)
- [ ] 2-locus spatial grammar (left/right NP placement)
- [ ] Fingerspelling fallback for unknown words
- [ ] Mobile PWA packaging

---

## Acknowledgements

- [iSign](https://exploration-lab.github.io/iSign/) — Exploration Lab, IIT — ISL dataset (ACL 2024)
- [ISLRTC](https://islrtc.nic.in) — Indian Sign Language Research and Training Centre
- [Ready Player Me](https://readyplayer.me) — 3D avatar platform
- [Deepgram](https://deepgram.com) — Streaming speech recognition
- [ElevenLabs](https://elevenlabs.io) — Text-to-speech
- [AI4Bharat](https://ai4bharat.iitm.ac.in) — IndicTrans2, IndicWav2Vec

---

## License

MIT
