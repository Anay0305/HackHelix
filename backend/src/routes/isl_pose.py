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

import numpy as np

from src.services.isl_grammar import text_to_gloss
from src.services.pose_lookup import get_pose

router = APIRouter(prefix="/isl", tags=["isl"])

MS_PER_FRAME = 400


def _extract_arm(frame: dict) -> dict:
    """Extract arm landmarks + 21-pt hand shapes for full avatar retargeting."""
    b = frame["body"]
    rh = frame.get("rightHand", [])
    lh = frame.get("leftHand",  [])
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


# ── /isl/grade — real-time sign quality scoring ───────────────────────────────

def _normalize_hand(landmarks: list) -> np.ndarray | None:
    """Wrist-center + scale-normalize 21 hand landmarks → (21,3) float32."""
    if len(landmarks) < 21:
        return None
    pts = np.array([[lm["x"], lm["y"], lm.get("z", 0.0)] for lm in landmarks],
                   dtype=np.float32)
    wrist = pts[0].copy()
    pts -= wrist
    scale = float(np.linalg.norm(pts[9])) + 1e-6
    return pts / scale


_FINGERS = {
    "thumb":  [1, 2, 3, 4],
    "index":  [5, 6, 7, 8],
    "middle": [9, 10, 11, 12],
    "ring":   [13, 14, 15, 16],
    "pinky":  [17, 18, 19, 20],
}


def _finger_scores(ref: np.ndarray, usr: np.ndarray) -> dict[str, int]:
    scores = {}
    for name, ids in _FINGERS.items():
        ref_v = ref[ids[-1]] - ref[ids[0]]
        usr_v = usr[ids[-1]] - usr[ids[0]]
        n_ref = np.linalg.norm(ref_v)
        n_usr = np.linalg.norm(usr_v)
        if n_ref < 1e-6 or n_usr < 1e-6:
            scores[name] = 50
            continue
        cos = float(np.dot(ref_v, usr_v) / (n_ref * n_usr))
        scores[name] = max(0, int(((cos + 1) / 2) * 100))
    return scores


class _GradeReq(BaseModel):
    sign: str
    userHand: list  # 21 landmarks [{x,y,z?}]


@router.post("/grade")
async def grade_sign(req: _GradeReq):
    """
    Score how closely the user's hand shape matches the reference sign.

    Request:  { "sign": "HELLO", "userHand": [{x,y,z?}×21] }
    Response: { "score": 0-100, "fingerScores": {thumb,index,...}, "pass": bool }

    Used by the SignAlong exercise to give real-time grading feedback.
    """
    frames = get_pose(req.sign.upper())
    if not frames:
        return {"score": 0, "fingerScores": {}, "pass": False, "error": "sign not found"}

    # Find the keyframe with the richest hand data for reference
    ref_hand = None
    for frame in frames:
        rh = frame.get("rightHand", [])
        if len(rh) >= 21:
            ref_hand = rh
            break
    if ref_hand is None:
        return {"score": 50, "fingerScores": {}, "pass": False, "error": "no hand ref"}

    ref_pts = _normalize_hand(ref_hand)
    usr_pts = _normalize_hand(req.userHand)

    if ref_pts is None or usr_pts is None:
        return {"score": 0, "fingerScores": {}, "pass": False, "error": "bad landmarks"}

    finger_scores = _finger_scores(ref_pts, usr_pts)
    overall = int(np.mean(list(finger_scores.values())))
    return {
        "score": overall,
        "fingerScores": finger_scores,
        "pass": overall >= 65,
    }
