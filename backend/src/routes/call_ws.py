"""
Bi-directional ISL call via room-based WebSocket relay.

Two people share a 6-char room code. Each connects as "hearing" or "deaf".
The backend runs the full pipeline for each side and routes output to the
correct partner WebSocket:

  Hearing  ->  audio_chunk  ->  Deepgram STT -> ISL grammar -> pose_sequence  ->  Deaf
  Deaf     ->  landmarks    ->  classifier  -> LLM -> ElevenLabs -> tts_ready   ->  Hearing
"""

import asyncio
import base64
import json
import os
import random
import string
import time
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, HTTPException

from src.services.sign_classifier import classify_sequence_scored
from src.services.sentence_former import gloss_to_sentence
from src.services.isl_grammar import text_to_gloss
from src.services.elevenlabs_client import synthesize
from src.services.pose_lookup import get_pose

router = APIRouter()

# In-memory room registry — room_id -> {hearing: WS|None, deaf: WS|None}
rooms: dict[str, dict] = {}

SILENCE_TIMEOUT = 1.5
FRAME_WINDOW_MAX = 24


def _make_room_id() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


@router.post("/call/room")
async def create_room():
    for _ in range(20):
        rid = _make_room_id()
        if rid not in rooms:
            rooms[rid] = {"hearing": None, "deaf": None}
            return {"room_id": rid}
    raise HTTPException(status_code=500, detail="Could not generate unique room ID")


@router.get("/call/room/{room_id}")
async def room_status(room_id: str):
    r = rooms.get(room_id)
    if not r:
        return {"exists": False, "hearing_connected": False, "deaf_connected": False}
    return {
        "exists": True,
        "hearing_connected": r["hearing"] is not None,
        "deaf_connected": r["deaf"] is not None,
    }


# ── helpers ───────────────────────────────────────────────────────────────────

def _unflatten(arr: list[float]) -> list[list[float]]:
    return [[arr[i], arr[i + 1], arr[i + 2]] for i in range(0, len(arr) - 2, 3)]


def _extract_arm(frame: dict) -> dict:
    b = frame["body"]
    rh = frame.get("rightHand", [])
    lh = frame.get("leftHand", [])
    return {
        "rs": {"x": b[11]["x"], "y": b[11]["y"]},
        "re": {"x": b[13]["x"], "y": b[13]["y"]},
        "rw": {"x": b[15]["x"], "y": b[15]["y"]},
        "ls": {"x": b[12]["x"], "y": b[12]["y"]},
        "le": {"x": b[14]["x"], "y": b[14]["y"]},
        "lw": {"x": b[16]["x"], "y": b[16]["y"]},
        "rightHand": [{"x": lm["x"], "y": lm["y"]} for lm in rh],
        "leftHand":  [{"x": lm["x"], "y": lm["y"]} for lm in lh],
    }


def _gloss_tokens(words: list[str]) -> list[dict]:
    return [{"gloss": w, "startMs": i * 600, "endMs": (i + 1) * 600}
            for i, w in enumerate(words)]


# ── WebSocket handler ─────────────────────────────────────────────────────────

@router.websocket("/ws/call/{room_id}")
async def call_websocket(
    ws: WebSocket,
    room_id: str,
    role: str = Query(..., pattern="^(hearing|deaf)$"),
):
    await ws.accept()

    if room_id not in rooms:
        rooms[room_id] = {"hearing": None, "deaf": None}
    rooms[room_id][role] = ws

    partner_role = "deaf" if role == "hearing" else "hearing"

    async def send_self(msg: dict):
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    async def send_partner(msg: dict):
        p = rooms.get(room_id, {}).get(partner_role)
        if p:
            try:
                await p.send_json(msg)
            except Exception:
                pass

    # Notify both sides when partner arrives
    partner_ws = rooms[room_id].get(partner_role)
    if partner_ws:
        await send_self({"type": "partner_joined"})
        await send_partner({"type": "partner_joined"})

    # ── hearing-side state ───────────────────────────────────────────────────
    dg_connection = None
    sample_rate = 48000

    async def init_deepgram(sr: int):
        nonlocal dg_connection
        from deepgram import DeepgramClient, LiveTranscriptionEvents, LiveOptions
        api_key = os.getenv("DEEPGRAM_API_KEY", "")
        dg   = DeepgramClient(api_key)
        conn = dg.listen.asyncwebsocket.v("1")

        async def on_transcript(self, result, **kwargs):
            try:
                text = result.channel.alternatives[0].transcript
                if not text or not result.is_final:
                    return
                t0 = int(time.time() * 1000)
                conf = result.channel.alternatives[0].confidence
                await send_self({
                    "type": "transcript", "partial": False,
                    "text": text, "confidence": conf, "timestampMs": t0,
                })
                asyncio.create_task(handle_speech(text))
            except Exception:
                pass

        conn.on(LiveTranscriptionEvents.Transcript, on_transcript)
        conn.on(LiveTranscriptionEvents.Error, lambda *a, **k: None)

        options = LiveOptions(
            model="nova-3", language="en-IN", encoding="linear16",
            sample_rate=sr, channels=1, smart_format=True,
            interim_results=False, endpointing=300, punctuate=True,
        )
        started = await conn.start(options)
        if not started:
            raise RuntimeError("Deepgram failed to start")
        dg_connection = conn

    async def handle_speech(text: str):
        try:
            result = await text_to_gloss(text)
            words: list[str] = result.get("gloss", [])
            nmm: str = result.get("nmm", "none")

            nmm_morph = (
                {"brow_raise": 0.7} if nmm == "question" else
                {"brow_lower": 0.6} if nmm == "negation" else {}
            )

            # Build pose sequence once, send to both sides
            # (deaf: drives their avatar | hearing: drives their ISL preview)
            word_poses = []
            for word in words:
                frames    = get_pose(word)
                arm_frames = [_extract_arm(f) for f in frames]
                word_poses.append({"word": word, "frames": arm_frames})

            gloss_msg = {
                "type": "gloss",
                "tokens": _gloss_tokens(words),
                "sentiment": "neutral",
                "sourceText": text,
            }
            pose_msg = {
                "type": "pose_sequence",
                "words": word_poses,
                "msPerFrame": 400,
            }
            cue_msg = {
                "type": "avatar_cue",
                "clip": words[0].lower() if words else "idle",
                "morphTargets": nmm_morph,
                "durationMs": len(words) * 600,
            }

            await send_partner(gloss_msg)
            await send_partner(pose_msg)
            await send_partner(cue_msg)
            # Mirror to self so hearing-side avatar preview also animates
            await send_self(gloss_msg)
            await send_self(pose_msg)
            await send_self(cue_msg)

        except Exception as e:
            await send_self({"type": "error", "code": "speech_error", "msg": str(e)})

    # ── deaf-side state ──────────────────────────────────────────────────────
    sign_buffer: list[str] = []
    frame_window: list = []
    last_classified: str | None = None
    cooldown_until = 0.0
    flush_task: asyncio.Task | None = None

    async def flush_signs(immediate: bool = False):
        nonlocal sign_buffer
        if not immediate:
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
            audio_url = "data:audio/mpeg;base64," + base64.b64encode(audio_bytes).decode()
        except Exception:
            audio_url = ""

        # TTS audio -> hearing person; captions text -> deaf person for confirmation
        await send_partner({"type": "tts_ready", "audioUrl": audio_url, "captions": sentence})
        await send_self({
            "type": "log", "level": "info",
            "msg": f"Sent to hearing: \"{sentence}\"", "latencyMs": 0,
        })

    # ── main receive loop ────────────────────────────────────────────────────
    try:
        while True:
            raw  = await ws.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "ping":
                await send_self({"type": "pong", "t": data.get("t", 0)})
                continue

            if msg_type == "stop":
                break

            # ── hearing-side messages ────────────────────────────────────────
            if role == "hearing":
                if msg_type == "start":
                    sample_rate = data.get("sampleRate", 48000)
                    continue

                if msg_type == "audio_chunk":
                    chunk = base64.b64decode(data["pcm16Base64"])
                    if dg_connection is None:
                        try:
                            await init_deepgram(sample_rate)
                        except Exception as e:
                            await send_self({"type": "error", "code": "deepgram_init_failed", "msg": str(e)})
                            continue
                    await dg_connection.send(chunk)
                    continue

                if msg_type == "text":
                    text = (data.get("payload") or "").strip()
                    if text:
                        t0 = int(time.time() * 1000)
                        await send_self({
                            "type": "transcript", "partial": False,
                            "text": text, "confidence": 1.0, "timestampMs": t0,
                        })
                        asyncio.create_task(handle_speech(text))
                    continue

            # ── deaf-side messages ───────────────────────────────────────────
            if role == "deaf":
                if msg_type == "landmarks":
                    frame = data.get("frame", {})
                    right_flat = frame.get("rightHand", [])
                    left_flat  = frame.get("leftHand",  [])
                    flat = right_flat if len(right_flat) >= 63 else left_flat
                    if len(flat) < 63:
                        continue

                    landmarks = _unflatten(flat)
                    now = time.time()

                    frame_window.append(landmarks)
                    if len(frame_window) > FRAME_WINDOW_MAX:
                        frame_window.pop(0)

                    if len(frame_window) < 8 or now < cooldown_until:
                        continue

                    sign, conf = classify_sequence_scored(frame_window)
                    if not sign or conf < 0.30:
                        continue
                    if sign == last_classified:
                        continue

                    last_classified = sign
                    cooldown_until  = now + 0.6
                    sign_buffer.append(sign)

                    await send_self({
                        "type": "transcript", "partial": True,
                        "text": sign, "confidence": conf, "timestampMs": int(now * 1000),
                    })
                    await send_partner({
                        "type": "transcript", "partial": True,
                        "text": f"[signing: {sign}]", "confidence": conf,
                        "timestampMs": int(now * 1000),
                    })

                    if flush_task and not flush_task.done():
                        flush_task.cancel()
                    flush_task = asyncio.create_task(flush_signs())
                    continue

                if msg_type == "gloss_text":
                    raw_gloss = (data.get("payload") or "").strip().upper()
                    if raw_gloss:
                        tokens = [t for t in raw_gloss.split() if t]
                        sign_buffer.extend(tokens)
                        if flush_task and not flush_task.done():
                            flush_task.cancel()
                        flush_task = asyncio.create_task(flush_signs(immediate=True))
                    continue

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await send_self({"type": "error", "code": "internal", "msg": str(e)})
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

        # Unregister and notify partner
        if rooms.get(room_id, {}).get(role) is ws:
            rooms[room_id][role] = None
        await send_partner({"type": "partner_left"})

        # Clean up empty rooms
        r = rooms.get(room_id, {})
        if not r.get("hearing") and not r.get("deaf"):
            rooms.pop(room_id, None)
