"""
Unified WebSocket endpoint: /ws/simulator

Speaks the typed ClientMsg / ServerMsg protocol defined in frontend/src/api/types.ts.

Modes:
  speech2isl — audio_chunk (base64 PCM16) → Deepgram STT → ISL grammar → gloss + avatar_cue
               Also runs: YAMNet (sound alerts) + SpeechBrain (emotion) in background
  isl2speech — landmarks (HolisticFrame)  → sign classifier → sentence → ElevenLabs TTS

Extra message types emitted:
  alert   — {"type":"alert","alertType":str,"confidence":float,"label":str}
  emotion — {"type":"emotion","emotion":str,"intensity":float,"morphTargets":dict}
"""

import asyncio
import base64
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from deepgram import DeepgramClient, LiveTranscriptionEvents, LiveOptions
import os

from src.services.sign_classifier import classify_sign, classify_sequence, classify_sequence_scored
from src.services.sentence_former import gloss_to_sentence
from src.services.isl_grammar import text_to_gloss
from src.services.elevenlabs_client import synthesize
from src.services.emotion_merger import analyze_audio_sync
from src.services.yamnet_service import detect_alert_sync
from src.services.pose_lookup import get_pose

router = APIRouter()

HOLD_DURATION   = 0.5
SILENCE_TIMEOUT = 1.5
MOVEMENT_THRESH = 0.04

DEFAULT_SAMPLE_RATE = 48000

# YAMNet runs once we've buffered this many bytes (≈ 1.5 s at 48 kHz PCM16)
YAMNET_TRIGGER_BYTES = 48_000 * 2 * 2   # 2 s worth

# Emotion runs on audio buffered since last final transcript (min 0.5 s)
EMOTION_MIN_BYTES = 48_000 * 2          # 0.5 s


def _unflatten(arr: list[float]) -> list[list[float]]:
    return [[arr[i], arr[i + 1], arr[i + 2]] for i in range(0, len(arr) - 2, 3)]


def _landmark_delta(prev: list, curr: list) -> float:
    if not prev or not curr or len(prev) != len(curr):
        return 1.0
    total = sum(abs(p[0] - c[0]) + abs(p[1] - c[1]) for p, c in zip(prev, curr))
    return total / len(prev)


def _make_gloss_tokens(words: list[str]) -> list[dict]:
    return [
        {"gloss": word, "startMs": i * 600, "endMs": (i + 1) * 600}
        for i, word in enumerate(words)
    ]


def _nmm_to_sentiment(nmm: str) -> str:
    return {"question": "neutral", "negation": "urgent", "none": "neutral"}.get(nmm, "neutral")


def _extract_arm(frame: dict) -> dict:
    """Extract the 6 arm landmarks from a SignFrame body array."""
    b = frame["body"]
    return {
        "rs": {"x": b[11]["x"], "y": b[11]["y"]},
        "re": {"x": b[13]["x"], "y": b[13]["y"]},
        "rw": {"x": b[15]["x"], "y": b[15]["y"]},
        "ls": {"x": b[12]["x"], "y": b[12]["y"]},
        "le": {"x": b[14]["x"], "y": b[14]["y"]},
        "lw": {"x": b[16]["x"], "y": b[16]["y"]},
    }


@router.websocket("/ws/simulator")
async def simulator_websocket(ws: WebSocket):
    await ws.accept()

    mode: str | None = None
    sample_rate: int = DEFAULT_SAMPLE_RATE

    # ── speech2isl state ──────────────────────────────────────────────────
    dg_connection = None
    audio_buffer = bytearray()        # PCM16 accumulated for emotion
    yamnet_buffer = bytearray()       # PCM16 accumulated for YAMNet
    last_emotion: dict = {}           # carry forward to next avatar_cue

    # ── isl2speech state ──────────────────────────────────────────────────
    sign_buffer: list[str] = []
    prev_landmarks: list = []
    hold_start: float | None = None
    last_classified: str | None = None
    cooldown_until = 0.0
    flush_task: asyncio.Task | None = None
    # rolling window of recent landmark frames for the LSTM
    frame_window: list[list[list[float]]] = []
    FRAME_WINDOW_MAX = 24

    # ─────────────────────────────────────────────────────────────────────

    async def send(msg: dict):
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    # ── speech2isl helpers ────────────────────────────────────────────────

    async def init_deepgram(sr: int):
        nonlocal dg_connection
        api_key = os.getenv("DEEPGRAM_API_KEY", "")
        if not api_key:
            raise ValueError("DEEPGRAM_API_KEY is not set in backend/.env")

        masked = api_key[:6] + "..." + api_key[-4:]
        print(f"[deepgram] connecting — key={masked} sample_rate={sr}")

        dg   = DeepgramClient(api_key)
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
            err_str = str(error)
            print(f"[deepgram] error: {err_str}")
            hint = ""
            if "401" in err_str:
                hint = " — invalid or expired DEEPGRAM_API_KEY"
            elif "403" in err_str:
                hint = " — key lacks streaming permissions"
            await send({"type": "error", "code": "deepgram_error", "msg": err_str + hint})

        conn.on(LiveTranscriptionEvents.Transcript, on_transcript)
        conn.on(LiveTranscriptionEvents.Error, on_error)

        options = LiveOptions(
            model="nova-3",
            language="en-IN",
            encoding="linear16",
            sample_rate=sr,
            channels=1,
            smart_format=True,
            interim_results=True,
            endpointing=300,
            punctuate=True,
        )
        try:
            started = await conn.start(options)
            if not started:
                raise RuntimeError("Deepgram returned false from start() — check API key and plan")
        except Exception as e:
            err = str(e)
            if "401" in err:
                raise RuntimeError(f"Deepgram 401 Unauthorized — DEEPGRAM_API_KEY ({masked}) is invalid or expired") from e
            raise RuntimeError(f"Deepgram failed to connect: {err}") from e

        print(f"[deepgram] connected OK — nova-3 streaming at {sr} Hz")
        dg_connection = conn

    async def handle_final_transcript(text: str, t0: int):
        nonlocal audio_buffer, last_emotion
        t1 = int(time.time() * 1000)

        # Run emotion on audio buffered since last transcript (background thread)
        audio_snapshot = bytes(audio_buffer)
        audio_buffer.clear()
        if len(audio_snapshot) >= EMOTION_MIN_BYTES:
            emotion = await asyncio.to_thread(
                analyze_audio_sync, audio_snapshot, sample_rate
            )
            last_emotion = emotion
            await send({"type": "emotion", **emotion})

        try:
            result = await text_to_gloss(text)
            words: list[str] = result.get("gloss", [])
            nmm: str = result.get("nmm", "none")

            tokens = _make_gloss_tokens(words)
            sentiment = _nmm_to_sentiment(nmm)

            print(f"[groq] input='{text}' -> gloss={words} nmm={nmm}")

            await send({
                "type":       "gloss",
                "tokens":     tokens,
                "sentiment":  sentiment,
                "sourceText": text,
            })

            # Build and send pose sequence for avatar animation
            word_poses = []
            for word in words:
                frames = get_pose(word)
                arm_frames = [_extract_arm(f) for f in frames]
                word_poses.append({"word": word, "frames": arm_frames})
            await send({
                "type":       "pose_sequence",
                "words":      word_poses,
                "msPerFrame": 400,
            })

            # Merge NMM morph targets with emotion morph targets
            nmm_morph = (
                {"brow_raise": 0.7} if nmm == "question" else
                {"brow_lower": 0.6} if nmm == "negation" else {}
            )
            morph = {**last_emotion.get("morphTargets", {}), **nmm_morph}

            await send({
                "type":         "avatar_cue",
                "clip":         words[0].lower() if words else "idle",
                "morphTargets": morph,
                "durationMs":   len(words) * 600,
            })

            await send({
                "type":      "log",
                "level":     "info",
                "msg":       f"gloss: {' '.join(words)} [{nmm}] emotion:{last_emotion.get('emotion','?')}",
                "latencyMs": int(time.time() * 1000) - t1,
            })
        except Exception as e:
            await send({"type": "error", "code": "grammar_error", "msg": str(e)})

    async def maybe_run_yamnet(audio_bytes: bytes):
        """Run YAMNet on buffered audio and emit alert if detected."""
        alert = await asyncio.to_thread(detect_alert_sync, audio_bytes, sample_rate)
        if alert:
            await send({"type": "alert", **alert})

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
            audio_url = "data:audio/mpeg;base64," + base64.b64encode(audio_bytes).decode()
        except Exception:
            audio_url = ""

        await send({"type": "tts_ready", "audioUrl": audio_url, "captions": sentence})

    # ── main loop ─────────────────────────────────────────────────────────

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "ping":
                await send({"type": "pong", "t": data.get("t", 0)})
                continue

            if msg_type == "stop":
                break

            if msg_type == "start":
                mode = data.get("mode")
                sample_rate = data.get("sampleRate", DEFAULT_SAMPLE_RATE)
                if mode == "speech2isl":
                    # Only open Deepgram when client intends to stream audio
                    # (voice mode sends sampleRate; text mode doesn't)
                    if data.get("sampleRate") is not None:
                        await init_deepgram(sample_rate)
                    await send({"type": "log", "level": "info",
                                "msg": "speech2isl ready", "latencyMs": 0})
                elif mode == "isl2speech":
                    await send({"type": "log", "level": "info",
                                "msg": "isl2speech ready", "latencyMs": 0})
                continue

            # ── speech2isl: direct text input ─────────────────────────────
            if msg_type == "text" and mode == "speech2isl":
                text = (data.get("payload") or "").strip()
                if not text:
                    continue
                t0 = int(time.time() * 1000)
                await send({
                    "type":        "transcript",
                    "partial":     False,
                    "text":        text,
                    "confidence":  1.0,
                    "timestampMs": t0,
                })
                asyncio.create_task(handle_final_transcript(text, t0))
                continue

            # ── speech2isl: audio chunk ───────────────────────────────────
            if msg_type == "audio_chunk" and mode == "speech2isl":
                try:
                    chunk = base64.b64decode(data["pcm16Base64"])

                    # Lazy-init: only connect to Deepgram when audio actually arrives
                    if dg_connection is None:
                        try:
                            await init_deepgram(sample_rate)
                        except Exception as e:
                            print(f"[simulator] init_deepgram failed: {e}")
                            await send({"type": "error", "code": "deepgram_init_failed", "msg": str(e)})
                            continue

                    await dg_connection.send(chunk)

                    # Accumulate for emotion (cleared per-transcript)
                    audio_buffer.extend(chunk)

                    # Accumulate for YAMNet; fire + clear when threshold hit
                    yamnet_buffer.extend(chunk)
                    if len(yamnet_buffer) >= YAMNET_TRIGGER_BYTES:
                        snapshot = bytes(yamnet_buffer)
                        yamnet_buffer.clear()
                        asyncio.create_task(maybe_run_yamnet(snapshot))

                except Exception as e:
                    await send({"type": "error", "code": "audio_error", "msg": str(e)})
                continue

            # ── isl2speech: landmarks ─────────────────────────────────────
            if msg_type == "landmarks" and mode == "isl2speech":
                frame = data.get("frame", {})
                right_flat = frame.get("rightHand", [])
                left_flat  = frame.get("leftHand",  [])
                # pick whichever hand is present; prefer right
                flat = right_flat if len(right_flat) >= 63 else left_flat
                if len(flat) < 63:
                    continue

                landmarks = _unflatten(flat)
                now = time.time()

                frame_window.append(landmarks)
                if len(frame_window) > FRAME_WINDOW_MAX:
                    frame_window.pop(0)

                delta = _landmark_delta(prev_landmarks, landmarks)
                prev_landmarks = landmarks

                # Classify as soon as the window has ~0.5 s of data (8 frames
                # at 15 fps) and we're past the debounce cooldown. Don't wait
                # for perfect stillness — natural signing is never fully still
                # and demanding a 500 ms hold starves the UI.
                if len(frame_window) < 8 or now < cooldown_until:
                    continue

                sign, conf = classify_sequence_scored(frame_window)
                print(f"[isl2speech] classified={sign} conf={conf:.2f} buf={len(frame_window)} delta={delta:.3f}")
                if not sign or conf < 0.45:
                    # Even if we reject the prediction, send a low-conf
                    # transcript every 2 s so the UI's RECOGNIZED bar reflects
                    # "camera seeing hand, not sure what sign yet" instead of
                    # frozen 0%.
                    if now - (hold_start or 0) > 2.0:
                        hold_start = now
                        await send({
                            "type":        "transcript",
                            "partial":     True,
                            "text":        sign or "…",
                            "confidence":  conf,
                            "timestampMs": int(now * 1000),
                        })
                    continue
                if sign == last_classified:
                    continue

                last_classified = sign
                hold_start = now
                cooldown_until = now + 0.6
                sign_buffer.append(sign)

                await send({
                    "type":        "transcript",
                    "partial":     True,
                    "text":        sign,
                    "confidence":  conf,
                    "timestampMs": int(now * 1000),
                })

                if flush_task and not flush_task.done():
                    flush_task.cancel()
                flush_task = asyncio.create_task(flush_buffer())

                continue

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
