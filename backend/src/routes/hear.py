"""
WebSocket endpoint: /ws/hear

Frontend sends final Deepgram transcripts.
Backend:
  1. Runs ISL grammar (Claude) -> gloss tokens + NMM
  2. Sends gloss immediately for UI display
  3. Streams pose frames for each token so the avatar animates

Message flow:
  Frontend -> {"text": "What is your name?"}
  Backend  -> {"type": "gloss",  "tokens": ["YOU","NAME","WHAT"], "nmm": "question"}
  Backend  -> {"type": "frame",  "frame": {body,rightHand,leftHand}, "nmm": "question", "word": "YOU"}
  Backend  -> {"type": "frame",  ...}   (one per keyframe, 550ms apart)
  Backend  -> {"type": "error",  "message": "..."} on failure
"""

import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from src.services.isl_grammar import text_to_gloss
from src.services.pose_lookup import get_pose

router = APIRouter()

FRAME_DURATION = 0.55  # seconds between keyframes


@router.websocket("/ws/hear")
async def hear_websocket(ws: WebSocket):
    await ws.accept()

    try:
        while True:
            raw = await ws.receive_text()
            data = json.loads(raw)
            text = data.get("text", "").strip()

            if not text:
                continue

            try:
                result = await text_to_gloss(text)
                tokens: list[str] = result.get("gloss", [])
                nmm: str = result.get("nmm", "none")

                # 1. Send gloss immediately for caption/chip display
                await ws.send_json({
                    "type":   "gloss",
                    "tokens": tokens,
                    "nmm":    nmm,
                    "source": text,
                })

                # 2. Stream pose frames for each token
                for word in tokens:
                    frames = get_pose(word)
                    for frame in frames:
                        await ws.send_json({
                            "type":  "frame",
                            "frame": frame,
                            "nmm":   nmm,
                            "word":  word,
                        })
                        await asyncio.sleep(FRAME_DURATION)

            except Exception as e:
                await ws.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
