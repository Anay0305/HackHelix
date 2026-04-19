"""
WebSocket /ws/monitor
=====================
Dedicated always-on sound monitor for deaf users. Runs YAMNet on a rolling
audio buffer from the client's mic and streams `alert` events whenever a
target class (fire alarm, doorbell, siren, horn, phone, baby cry, etc.)
crosses its threshold.

Protocol
--------
Client -> Server
    {"type": "start", "sampleRate": 48000}          # optional, defaults 48 kHz
    {"type": "audio_chunk", "pcm16Base64": "..."}   # PCM16 mono chunk
    {"type": "stop"}

Server -> Client
    {"type": "ready"}
    {"type": "alert", "alertType": "...", "confidence": 0.92, "label": "Fire alarm",
     "timestampMs": 1776560000000}
    {"type": "status", "bufferedMs": 1500}          # emitted every ~1 s
    {"type": "error", "msg": "..."}
"""

import asyncio
import base64
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.services.yamnet_service import detect_alert_sync

router = APIRouter()

DEFAULT_SAMPLE_RATE = 48_000

# YAMNet needs ≥ 0.96 s. Run it every ~2 s on the last 2 s of audio.
WINDOW_SECONDS = 2.0
STEP_SECONDS   = 1.0
STATUS_EVERY_MS = 1_000
# Debounce: don't re-emit the same alertType within this many seconds
ALERT_DEBOUNCE_S = 4.0


@router.websocket("/ws/monitor")
async def monitor_websocket(ws: WebSocket):
    await ws.accept()

    sample_rate = DEFAULT_SAMPLE_RATE
    buffer = bytearray()
    last_run = 0.0
    last_status = 0.0
    last_alert: dict[str, float] = {}   # alertType -> last-emit epoch s
    running = False

    async def send(msg: dict):
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    async def maybe_detect(now: float):
        nonlocal last_run
        bytes_per_sample = 2  # PCM16
        window_bytes = int(WINDOW_SECONDS * sample_rate * bytes_per_sample)
        step_bytes   = int(STEP_SECONDS   * sample_rate * bytes_per_sample)
        if len(buffer) < window_bytes:
            return
        if (now - last_run) < STEP_SECONDS:
            return
        last_run = now
        snapshot = bytes(buffer[-window_bytes:])
        # Slide the buffer forward so we don't grow without bound
        if len(buffer) > window_bytes * 2:
            del buffer[: len(buffer) - window_bytes]

        alert = await asyncio.to_thread(detect_alert_sync, snapshot, sample_rate)
        if not alert:
            return

        atype = alert["alertType"]
        if (now - last_alert.get(atype, 0.0)) < ALERT_DEBOUNCE_S:
            return
        last_alert[atype] = now
        await send({
            **alert,
            "type":        "alert",
            "timestampMs": int(now * 1000),
        })

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            t = data.get("type")
            now = time.time()

            if t == "start":
                sample_rate = int(data.get("sampleRate", DEFAULT_SAMPLE_RATE))
                buffer.clear()
                last_run = 0.0
                last_status = now
                last_alert.clear()
                running = True
                await send({"type": "ready"})
                continue

            if t == "stop":
                running = False
                break

            if t == "audio_chunk" and running:
                try:
                    chunk = base64.b64decode(data["pcm16Base64"])
                except Exception as e:
                    await send({"type": "error", "msg": f"bad audio: {e}"})
                    continue
                buffer.extend(chunk)

                await maybe_detect(now)

                if (now * 1000) - (last_status * 1000) >= STATUS_EVERY_MS:
                    last_status = now
                    buffered_ms = int(
                        (len(buffer) / (sample_rate * 2)) * 1000
                    )
                    await send({"type": "status", "bufferedMs": buffered_ms})
                continue

            if t == "ping":
                await send({"type": "pong", "t": data.get("t", 0)})
                continue

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await send({"type": "error", "msg": str(e)})
