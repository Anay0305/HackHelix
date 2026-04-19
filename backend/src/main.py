"""
Sonorous Translation Engine — Phase 1 MVP
==========================================

A FastAPI WebSocket server that handles real-time bi-directional translation
between English audio/text and Indian Sign Language (ISL) gloss, targeting
sub-500ms round-trip latency.

Pipeline:
    Hearing User  ──▶ Audio   ──▶ Groq Whisper (STT) ──▶ Groq Llama-3 (ISL)
    Deaf User     ──▶ ISL text ──▶ ElevenLabs (TTS) ───▶ MP3 audio to hearing user

Run:
    cd backend
    uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

Required .env keys (see `.env.example`):
    GROQ_API_KEY=...
    ELEVENLABS_API_KEY=...
    ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # optional; defaults to Rachel
    FRONTEND_URL=http://localhost:5173        # optional; used for CORS
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import io
import json
import logging
import os
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from groq import AsyncGroq


# ──────────────────────────────────────────────────────────────────────────────
# Bootstrap
# ──────────────────────────────────────────────────────────────────────────────

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s — %(message)s",
)
log = logging.getLogger("sonorous")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

if not GROQ_API_KEY:
    log.warning("GROQ_API_KEY missing — Whisper + Llama calls will fail.")
if not ELEVENLABS_API_KEY:
    log.warning("ELEVENLABS_API_KEY missing — TTS calls will fail.")

# Shared async Groq client — reused across every websocket session so we're not
# paying the HTTPS handshake tax per request. The SDK manages its own pool.
groq_client = AsyncGroq(api_key=GROQ_API_KEY)


# ──────────────────────────────────────────────────────────────────────────────
# FastAPI app + CORS
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Sonorous Translation Engine", version="0.1.0")

# Permissive CORS for local dev (Vite default :5173, CRA :3000, and loopback IPs).
# Tighten to an explicit origin list before shipping to prod.
_FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        _FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────────────────────
# Routers — the frontend hits /ws/simulator, not the legacy /ws/translate.
# Keep both registered so either path works.
# ──────────────────────────────────────────────────────────────────────────────

from src.routes.stt import router as stt_router
from src.routes.isl_recognition import router as isl_router
from src.routes.hear import router as hear_router
from src.routes.simulator import router as simulator_router

app.include_router(stt_router)
app.include_router(isl_router)
app.include_router(hear_router)
app.include_router(simulator_router)


@app.on_event("startup")
async def _warm_ml_models() -> None:
    """Pre-load SpeechBrain + YAMNet in background threads so the first
    WebSocket session doesn't pay the model-download / load penalty."""
    from src.services.emotion_merger import preload as warm_emotion
    from src.services.yamnet_service import preload as warm_yamnet

    async def _run():
        try:
            await asyncio.to_thread(warm_emotion)
            log.info("[startup] SpeechBrain emotion model ready")
        except Exception as exc:
            log.warning("[startup] SpeechBrain warmup skipped: %s", exc)
        try:
            await asyncio.to_thread(warm_yamnet)
            log.info("[startup] YAMNet model ready")
        except Exception as exc:
            log.warning("[startup] YAMNet warmup skipped: %s", exc)

    asyncio.create_task(_run())


# ──────────────────────────────────────────────────────────────────────────────
# The Brain — English → ISL Gloss via Groq Llama-3
# ──────────────────────────────────────────────────────────────────────────────

ISL_SYSTEM_PROMPT = (
    "You are an English-to-Indian Sign Language (ISL) translator. ISL uses a "
    "Topic-Comment structure (e.g., 'What is your name?' becomes 'YOUR NAME "
    "WHAT'). Convert the following English text into ISL Gloss. Reply ONLY "
    "with a JSON object containing two keys: `gloss` (the translated string) "
    "and `sentiment` (a single word classifying the emotion: Neutral, Happy, "
    "Question, Urgent). Do not include markdown formatting or extra text."
)


async def translate_to_isl(english_text: str) -> dict[str, str]:
    """
    Convert an English sentence into an ISL Gloss + sentiment tag.

    Uses Groq's Llama-3-8b-8192 with JSON mode so the model is forced to emit
    a valid JSON object. Returns {"gloss": "...", "sentiment": "..."}.

    If the model somehow returns malformed JSON, we fall back to upper-casing
    the input and tagging it Neutral so the websocket never stalls.
    """
    resp = await groq_client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[
            {"role": "system", "content": ISL_SYSTEM_PROMPT},
            {"role": "user", "content": english_text},
        ],
        response_format={"type": "json_object"},  # Groq supports strict JSON mode
        temperature=0.2,                          # low creativity; we want determinism
        max_tokens=256,
    )

    raw = (resp.choices[0].message.content or "{}").strip()
    try:
        parsed: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        log.warning("Llama returned non-JSON (%r); falling back to upper-case.", raw)
        parsed = {"gloss": english_text.upper(), "sentiment": "Neutral"}

    # Normalise — gloss is always uppercase per ISL convention, sentiment always
    # has a sensible default so the frontend never renders "undefined".
    gloss = str(parsed.get("gloss", "")).strip().upper()
    sentiment = str(parsed.get("sentiment", "Neutral")).strip() or "Neutral"
    return {"gloss": gloss, "sentiment": sentiment}


# ──────────────────────────────────────────────────────────────────────────────
# STT — Groq Whisper-large-v3
# ──────────────────────────────────────────────────────────────────────────────

async def transcribe_audio(audio_bytes: bytes, mime: str = "audio/webm") -> str:
    """
    Send raw audio bytes to Groq Whisper and return the transcribed text.

    The browser MediaRecorder typically hands us webm/opus; we pass the
    extension hint through the filename so the server picks the right demuxer.
    """
    ext = "webm" if "webm" in mime else "wav" if "wav" in mime else "mp3"
    filename = f"clip.{ext}"

    # Groq's SDK accepts a (filename, bytes) tuple for the `file` parameter.
    resp = await groq_client.audio.transcriptions.create(
        file=(filename, audio_bytes),
        model="whisper-large-v3",
        response_format="text",
    )

    # When response_format="text", Groq returns a plain string; otherwise it's
    # an object with a `.text` attribute. Handle both for safety.
    if isinstance(resp, str):
        return resp.strip()
    return str(getattr(resp, "text", "") or "").strip()


# ──────────────────────────────────────────────────────────────────────────────
# TTS — ElevenLabs (eleven_turbo_v2 is the lowest-latency model they offer)
# ──────────────────────────────────────────────────────────────────────────────

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


async def synthesize_speech(text: str) -> bytes:
    """
    Convert text to speech via ElevenLabs turbo model. Returns MP3 bytes.

    Using a fresh httpx.AsyncClient per call is fine at this scale — if we
    ever hit QPS limits, swap to a module-level client with a connection pool.
    """
    url = ELEVENLABS_TTS_URL.format(voice_id=ELEVENLABS_VOICE_ID)
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
                # Accept mpeg explicitly so ElevenLabs doesn't fall back to wav
                "Accept": "audio/mpeg",
            },
            json={
                "text": text,
                "model_id": "eleven_turbo_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                },
            },
        )
        resp.raise_for_status()
        return resp.content


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket — the single translation endpoint
# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/translate")
async def ws_translate(websocket: WebSocket) -> None:
    """
    Bi-directional translation socket.

    Incoming JSON payloads:
      { "type": "audio_in",  "audio_base64": "<webm/wav>", "mime": "audio/webm" }
      { "type": "text_in",   "text":         "YOUR NAME WHAT" }

    Outgoing JSON payloads:
      { "type": "isl_output",   "original_text": ..., "gloss": ..., "sentiment": ... }
      { "type": "audio_output", "audio_base64": "<mp3>", "mime": "audio/mpeg" }
      { "type": "error",        "message": "..." }

    We stay in a receive-loop for the life of the socket. Each message is
    dispatched to a handler that does its own try/except so one bad payload
    doesn't tear down an otherwise-healthy session.
    """
    await websocket.accept()
    peer = (
        f"{websocket.client.host}:{websocket.client.port}"
        if websocket.client
        else "unknown"
    )
    log.info("WS connected: %s", peer)

    try:
        while True:
            raw = await websocket.receive_text()

            # Parse once up front so handlers get a dict, not a string.
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await _safe_send(websocket, {"type": "error", "message": "invalid JSON"})
                continue

            msg_type = payload.get("type")

            if msg_type == "audio_in":
                await _handle_audio_in(websocket, payload)
            elif msg_type == "text_in":
                await _handle_text_in(websocket, payload)
            else:
                await _safe_send(
                    websocket,
                    {"type": "error", "message": f"unknown type: {msg_type!r}"},
                )

    except WebSocketDisconnect:
        log.info("WS disconnected: %s", peer)
    except asyncio.CancelledError:
        # Server shutdown / task cancelled — propagate after logging.
        log.info("WS task cancelled: %s", peer)
        raise
    except Exception as exc:
        # Any other crash: log with traceback and try to notify the client
        # before the socket closes so the frontend shows a meaningful error.
        log.exception("WS crashed for %s: %s", peer, exc)
        await _safe_send(websocket, {"type": "error", "message": str(exc)})


# ──────────────────────────────────────────────────────────────────────────────
# Handlers (one per incoming message type)
# ──────────────────────────────────────────────────────────────────────────────

async def _handle_audio_in(ws: WebSocket, payload: dict[str, Any]) -> None:
    """Hearing user spoke → Whisper STT → Llama ISL gloss → emit `isl_output`."""
    b64 = payload.get("audio_base64", "")
    mime = payload.get("mime", "audio/webm")

    if not b64:
        await _safe_send(ws, {"type": "error", "message": "audio_base64 missing"})
        return

    # Decode up front so we fail fast on bad input — cheap & avoids wasting
    # a Whisper call on garbage bytes.
    try:
        audio_bytes = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        await _safe_send(ws, {"type": "error", "message": f"bad base64: {exc}"})
        return

    if len(audio_bytes) < 512:
        await _safe_send(ws, {"type": "error", "message": "audio too short"})
        return

    try:
        # Two sequential network calls — the gloss depends on the transcript,
        # so they can't be parallelised. Each is awaited non-blockingly.
        original_text = await transcribe_audio(audio_bytes, mime)

        if not original_text:
            # Whisper returned nothing (silence / noise). Tell the frontend so
            # it can surface "didn't catch that" rather than hang.
            await _safe_send(ws, {
                "type": "isl_output",
                "original_text": "",
                "gloss": "",
                "sentiment": "Neutral",
            })
            return

        isl = await translate_to_isl(original_text)

        await _safe_send(ws, {
            "type": "isl_output",
            "original_text": original_text,
            "gloss": isl["gloss"],
            "sentiment": isl["sentiment"],
        })

    except Exception as exc:
        log.exception("audio_in pipeline failed")
        await _safe_send(ws, {"type": "error", "message": f"audio pipeline: {exc}"})


async def _handle_text_in(ws: WebSocket, payload: dict[str, Any]) -> None:
    """Deaf user's ISL → ElevenLabs TTS → emit `audio_output` as base64 MP3."""
    text = str(payload.get("text", "") or "").strip()

    if not text:
        await _safe_send(ws, {"type": "error", "message": "text missing"})
        return

    try:
        mp3_bytes = await synthesize_speech(text)
        b64_audio = base64.b64encode(mp3_bytes).decode("ascii")
        await _safe_send(ws, {
            "type": "audio_output",
            "audio_base64": b64_audio,
            "mime": "audio/mpeg",
        })
    except httpx.HTTPStatusError as exc:
        log.exception("ElevenLabs rejected the request (status %s)", exc.response.status_code)
        await _safe_send(ws, {
            "type": "error",
            "message": f"tts http {exc.response.status_code}",
        })
    except Exception as exc:
        log.exception("text_in pipeline failed")
        await _safe_send(ws, {"type": "error", "message": f"tts pipeline: {exc}"})


# ──────────────────────────────────────────────────────────────────────────────
# Utilities
# ──────────────────────────────────────────────────────────────────────────────

async def _safe_send(ws: WebSocket, payload: dict[str, Any]) -> None:
    """
    Send JSON without crashing the receive-loop if the peer has already gone away.
    `WebSocket.send_json` raises if the socket is closed — we swallow that so
    the outer loop can exit cleanly via WebSocketDisconnect instead.
    """
    try:
        await ws.send_json(payload)
    except Exception as exc:
        log.debug("send_json failed (peer likely gone): %s", exc)


# ──────────────────────────────────────────────────────────────────────────────
# Health
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "groq_configured": bool(GROQ_API_KEY),
        "elevenlabs_configured": bool(ELEVENLABS_API_KEY),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Dev entry point: `python -m src.main`
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
