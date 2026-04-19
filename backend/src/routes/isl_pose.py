"""
REST endpoint: GET /isl/pose?words=HELLO,ME,WATER

Returns a pose_sequence for the given gloss words — one entry per word
with arm-landmark keyframes. Used by the Learn tab (LessonPage) to drive
the avatar through a SOV-reordered sentence without opening a WebSocket.

Response shape matches the simulator WebSocket's pose_sequence message:
  {
    "words": [{"word": "HELLO", "frames": [{rs, re, rw, ls, le, lw}, ...]}],
    "msPerFrame": 400
  }

Also accepts POST /isl/pose/text  {"text": "What is your name?"} — runs the
Groq grammar pipeline to produce ISL gloss, then returns poses for those
tokens. Drives the Learn tab's "watch the sentence" demo from a prompt.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from src.services.isl_grammar import text_to_gloss
from src.services.pose_lookup import get_pose

router = APIRouter(prefix="/isl", tags=["isl"])

MS_PER_FRAME = 400


def _extract_arm(frame: dict) -> dict:
    """Keep only the 6 arm landmarks the frontend retargets."""
    b = frame["body"]
    return {
        "rs": {"x": b[11]["x"], "y": b[11]["y"]},
        "re": {"x": b[13]["x"], "y": b[13]["y"]},
        "rw": {"x": b[15]["x"], "y": b[15]["y"]},
        "ls": {"x": b[12]["x"], "y": b[12]["y"]},
        "le": {"x": b[14]["x"], "y": b[14]["y"]},
        "lw": {"x": b[16]["x"], "y": b[16]["y"]},
    }


def _build_sequence(words: list[str]) -> dict:
    """Look up each gloss word and collect arm-keyframe sequences."""
    out = []
    for raw in words:
        word = (raw or "").strip().upper()
        if not word:
            continue
        frames = get_pose(word)
        arm_frames = [_extract_arm(f) for f in frames]
        out.append({"word": word, "frames": arm_frames})
    return {"words": out, "msPerFrame": MS_PER_FRAME}


@router.get("/pose")
async def pose_from_words(words: str = ""):
    """
    Return a pose_sequence for comma-separated gloss words.

    Example: /isl/pose?words=HELLO,ME,WATER
    """
    tokens = [w for w in (words or "").split(",") if w.strip()]
    return _build_sequence(tokens)


class _TextReq(BaseModel):
    text: str


@router.post("/pose/text")
async def pose_from_text(req: _TextReq):
    """
    Run SOV grammar reorder on the input text (any language supported by
    the grammar engine), then return a pose_sequence for the gloss tokens.

    Example body: {"text": "What is your name?"}
    Response includes both the gloss and the pose_sequence so the UI can
    display what it's signing.
    """
    result = await text_to_gloss(req.text)
    seq = _build_sequence(result.get("gloss", []))
    return {
        "gloss": result.get("gloss", []),
        "nmm": result.get("nmm", "none"),
        **seq,
    }
