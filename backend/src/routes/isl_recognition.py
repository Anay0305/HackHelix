"""
WebSocket endpoint: /ws/isl

Frontend sends MediaPipe landmark frames continuously.
Backend:
  1. Detects when hands are held still (sign held for 0.5s)
  2. Classifies the held pose -> ISL gloss word
  3. Adds to sign buffer
  4. On 1.5s silence (no new signs) -> Claude forms natural sentence
  5. Sends sentence back + ElevenLabs TTS audio (base64)
"""

import asyncio
import base64
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from src.services.sign_classifier import classify_sign, classify_sequence
from src.services.sentence_former import gloss_to_sentence
from src.services.elevenlabs_client import synthesize

router = APIRouter()

# Tuning constants
HOLD_DURATION   = 0.5   # seconds hand must be still to count as a sign
SILENCE_TIMEOUT = 1.5   # seconds of no new sign -> flush buffer to sentence
MOVEMENT_THRESH = 0.04  # normalized landmark movement threshold for "still"


def _landmark_delta(prev: list, curr: list) -> float:
    """Mean per-landmark movement between two frames."""
    if not prev or not curr or len(prev) != len(curr):
        return 1.0
    total = 0.0
    for p, c in zip(prev, curr):
        total += abs(p[0] - c[0]) + abs(p[1] - c[1])
    return total / len(prev)


@router.websocket("/ws/isl")
async def isl_websocket(ws: WebSocket):
    await ws.accept()

    sign_buffer: list[str] = []
    last_sign_time = 0.0

    prev_landmarks: list = []
    hold_start: float | None = None
    last_classified: str | None = None
    cooldown_until = 0.0  # prevent same sign repeating instantly
    frame_window: list[list[list[float]]] = []
    FRAME_WINDOW_MAX = 24

    flush_task: asyncio.Task | None = None

    async def flush_buffer():
        """Wait for silence timeout then form sentence from buffer."""
        nonlocal sign_buffer, last_sign_time

        await asyncio.sleep(SILENCE_TIMEOUT)

        if not sign_buffer:
            return

        gloss_tokens = sign_buffer.copy()
        sign_buffer.clear()

        # Send gloss immediately so frontend can show it
        await ws.send_json({
            "type": "gloss",
            "tokens": gloss_tokens,
        })

        # Claude -> natural sentence
        try:
            sentence = await gloss_to_sentence(gloss_tokens)
        except Exception as e:
            sentence = " ".join(gloss_tokens)

        await ws.send_json({
            "type": "sentence",
            "text": sentence,
        })

        # ElevenLabs TTS -> base64 MP3
        try:
            audio_bytes = await synthesize(sentence)
            audio_b64 = base64.b64encode(audio_bytes).decode()
            await ws.send_json({
                "type": "audio",
                "data": audio_b64,
                "mime": "audio/mpeg",
            })
        except Exception as e:
            await ws.send_json({"type": "error", "message": f"TTS failed: {e}"})

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)

            # Expect: {"hand": [[x,y,z], ...21 landmarks]}
            landmarks = data.get("hand", [])
            now = time.time()

            if not landmarks:
                prev_landmarks = []
                hold_start = None
                frame_window.clear()
                continue

            frame_window.append(landmarks)
            if len(frame_window) > FRAME_WINDOW_MAX:
                frame_window.pop(0)

            delta = _landmark_delta(prev_landmarks, landmarks)
            prev_landmarks = landmarks

            if delta < MOVEMENT_THRESH:
                # Hand is still
                if hold_start is None:
                    hold_start = now
                elif (now - hold_start) >= HOLD_DURATION and now > cooldown_until:
                    # Sign is held long enough — classify
                    sign = classify_sequence(frame_window) if len(frame_window) >= 4 else classify_sign(landmarks)
                    if sign and sign != last_classified:
                        last_classified = sign
                        last_sign_time = now
                        cooldown_until = now + 0.8  # debounce
                        sign_buffer.append(sign)

                        await ws.send_json({
                            "type": "sign",
                            "word": sign,
                            "buffer": sign_buffer.copy(),
                        })

                        # Reset flush timer
                        if flush_task and not flush_task.done():
                            flush_task.cancel()
                        flush_task = asyncio.create_task(flush_buffer())
            else:
                # Hand moved — reset hold
                hold_start = None
                last_classified = None

    except WebSocketDisconnect:
        if flush_task and not flush_task.done():
            flush_task.cancel()
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
