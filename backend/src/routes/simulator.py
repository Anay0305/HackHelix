"""
Unified WebSocket endpoint: /ws/simulator

Speaks the typed ClientMsg / ServerMsg protocol defined in frontend-new/src/api/types.ts.

Modes:
  speech2isl — audio_chunk (base64 PCM16) → Deepgram STT → ISL grammar → gloss + avatar_cue
  isl2speech — landmarks (HolisticFrame)  → sign classifier → sentence → ElevenLabs TTS
"""

import asyncio
import base64
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from deepgram import DeepgramClient, LiveTranscriptionEvents, LiveOptions
import os

from src.services.sign_classifier import classify_sign
from src.services.sentence_former import gloss_to_sentence
from src.services.isl_grammar import text_to_gloss
from src.services.elevenlabs_client import synthesize

router = APIRouter()

# Tuning — same as isl_recognition.py
HOLD_DURATION   = 0.5
SILENCE_TIMEOUT = 1.5
MOVEMENT_THRESH = 0.04

DEFAULT_SAMPLE_RATE = 48000  # browser AudioContext default


def _unflatten(arr: list[float]) -> list[list[float]]:
    """Convert flattened [x0,y0,z0,x1,y1,z1,...] to [[x,y,z],...]."""
    return [[arr[i], arr[i + 1], arr[i + 2]] for i in range(0, len(arr) - 2, 3)]


def _landmark_delta(prev: list, curr: list) -> float:
    if not prev or not curr or len(prev) != len(curr):
        return 1.0
    total = sum(abs(p[0] - c[0]) + abs(p[1] - c[1]) for p, c in zip(prev, curr))
    return total / len(prev)


def _make_gloss_tokens(words: list[str]) -> list[dict]:
    """Convert word list to GlossToken array with timing."""
    tokens = []
    for i, word in enumerate(words):
        tokens.append({
            "gloss":   word,
            "startMs": i * 600,
            "endMs":   (i + 1) * 600,
        })
    return tokens


def _nmm_to_sentiment(nmm: str) -> str:
    mapping = {"question": "neutral", "negation": "urgent", "none": "neutral"}
    return mapping.get(nmm, "neutral")


@router.websocket("/ws/simulator")
async def simulator_websocket(ws: WebSocket):
    await ws.accept()

    mode: str | None = None

    # ── speech2isl state ──────────────────────────────────────────────────
    dg_connection = None

    # ── isl2speech state ──────────────────────────────────────────────────
    sign_buffer: list[str] = []
    prev_landmarks: list = []
    hold_start: float | None = None
    last_classified: str | None = None
    cooldown_until = 0.0
    flush_task: asyncio.Task | None = None

    # ─────────────────────────────────────────────────────────────────────

    async def send(msg: dict):
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    # ── speech2isl helpers ────────────────────────────────────────────────

    async def init_deepgram(sample_rate: int):
        nonlocal dg_connection
        api_key = os.getenv("DEEPGRAM_API_KEY", "")
        dg = DeepgramClient(api_key)
        conn = dg.listen.asyncwebsocket.v("1")

        async def on_transcript(self, result, **kwargs):
            try:
                text = result.channel.alternatives[0].transcript
                if not text:
                    return
                is_final = result.is_final
                t0 = int(time.time() * 1000)

                await send({
                    "type":        "transcript",
                    "partial":     not is_final,
                    "text":        text,
                    "confidence":  result.channel.alternatives[0].confidence,
                    "timestampMs": t0,
                })

                if is_final:
                    asyncio.create_task(handle_final_transcript(text, t0))
            except Exception:
                pass

        async def on_error(self, error, **kwargs):
            await send({"type": "error", "code": "deepgram_error", "msg": str(error)})

        conn.on(LiveTranscriptionEvents.Transcript, on_transcript)
        conn.on(LiveTranscriptionEvents.Error, on_error)

        options = LiveOptions(
            model="nova-2",
            language="en-IN",
            encoding="linear16",
            sample_rate=sample_rate,
            channels=1,
            smart_format=True,
            interim_results=True,
            endpointing=300,
            punctuate=True,
        )
        await conn.start(options)
        dg_connection = conn

    async def handle_final_transcript(text: str, t0: int):
        t1 = int(time.time() * 1000)
        try:
            result = await text_to_gloss(text)
            words: list[str] = result.get("gloss", [])
            nmm: str = result.get("nmm", "none")

            tokens = _make_gloss_tokens(words)
            sentiment = _nmm_to_sentiment(nmm)

            await send({
                "type":       "gloss",
                "tokens":     tokens,
                "sentiment":  sentiment,
                "sourceText": text,
            })

            await send({
                "type":       "avatar_cue",
                "clip":       words[0].lower() if words else "idle",
                "morphTargets": {"brow_raise": 0.7} if nmm == "question" else
                               {"brow_lower": 0.6} if nmm == "negation" else {},
                "durationMs": len(words) * 600,
            })

            await send({
                "type":      "log",
                "level":     "info",
                "msg":       f"gloss: {' '.join(words)} [{nmm}]",
                "latencyMs": int(time.time() * 1000) - t1,
            })
        except Exception as e:
            await send({"type": "error", "code": "grammar_error", "msg": str(e)})

    # ── isl2speech helpers ────────────────────────────────────────────────

    async def flush_buffer():
        nonlocal sign_buffer
        await asyncio.sleep(SILENCE_TIMEOUT)
        if not sign_buffer:
            return

        tokens = sign_buffer.copy()
        sign_buffer.clear()

        try:
            sentence = await gloss_to_sentence(tokens)
        except Exception:
            sentence = " ".join(tokens)

        try:
            audio_bytes = await synthesize(sentence)
            audio_b64 = base64.b64encode(audio_bytes).decode()
            audio_url = f"data:audio/mpeg;base64,{audio_b64}"
        except Exception:
            audio_url = ""

        await send({
            "type":     "tts_ready",
            "audioUrl": audio_url,
            "captions": sentence,
        })

    # ── main loop ─────────────────────────────────────────────────────────

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            # ── ping / pong ──────────────────────────────────────────────
            if msg_type == "ping":
                await send({"type": "pong", "t": data.get("t", 0)})
                continue

            # ── stop ────────────────────────────────────────────────────
            if msg_type == "stop":
                break

            # ── start session ────────────────────────────────────────────
            if msg_type == "start":
                mode = data.get("mode")
                sample_rate = data.get("sampleRate", DEFAULT_SAMPLE_RATE)

                if mode == "speech2isl":
                    await init_deepgram(sample_rate)
                    await send({"type": "log", "level": "info",
                                "msg": "speech2isl ready", "latencyMs": 0})

                elif mode == "isl2speech":
                    await send({"type": "log", "level": "info",
                                "msg": "isl2speech ready", "latencyMs": 0})
                continue

            # ── speech2isl: audio chunk ───────────────────────────────────
            if msg_type == "audio_chunk" and mode == "speech2isl":
                if dg_connection:
                    try:
                        audio_bytes = base64.b64decode(data["pcm16Base64"])
                        await dg_connection.send(audio_bytes)
                    except Exception as e:
                        await send({"type": "error", "code": "audio_error", "msg": str(e)})
                continue

            # ── isl2speech: landmarks ─────────────────────────────────────
            if msg_type == "landmarks" and mode == "isl2speech":
                frame = data.get("frame", {})
                right_flat = frame.get("rightHand", [])
                if len(right_flat) < 63:  # need at least 21 landmarks × 3
                    continue

                landmarks = _unflatten(right_flat)
                now = time.time()

                delta = _landmark_delta(prev_landmarks, landmarks)
                prev_landmarks = landmarks

                if delta < MOVEMENT_THRESH:
                    if hold_start is None:
                        hold_start = now
                    elif (now - hold_start) >= HOLD_DURATION and now > cooldown_until:
                        sign = classify_sign(landmarks)
                        if sign and sign != last_classified:
                            last_classified = sign
                            cooldown_until = now + 0.8
                            sign_buffer.append(sign)

                            t_ms = int(now * 1000)
                            await send({
                                "type":        "transcript",
                                "partial":     True,
                                "text":        sign,
                                "confidence":  0.85,
                                "timestampMs": t_ms,
                            })

                            if flush_task and not flush_task.done():
                                flush_task.cancel()
                            flush_task = asyncio.create_task(flush_buffer())
                else:
                    hold_start = None
                    last_classified = None

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await send({"type": "error", "code": "internal", "msg": str(e)})
        except Exception:
            pass
    finally:
        if dg_connection:
            try:
                await dg_connection.finish()
            except Exception:
                pass
        if flush_task and not flush_task.done():
            flush_task.cancel()
