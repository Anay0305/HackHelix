"""
Pose lookup service — maps ISL gloss tokens to SignFrame sequences.

Each SignFrame has:
  body: 33 landmarks (MediaPipe Pose) — only [11-18] used for arms
  rightHand: 21 landmarks (MediaPipe Hand)
  leftHand: 21 landmarks (MediaPipe Hand)

Coordinates: MediaPipe normalized [0,1], origin top-left.
landmarkToVec3 on frontend: x→(x-0.5)*s, y→-(y-0.5)*s

When pose_db.json (from iSign dataset) is present it takes priority;
these hardcoded poses are the fallback for the 27 common signs.
"""

import json
from pathlib import Path

# ── helpers ────────────────────────────────────────────────────────────────

def lm(x: float, y: float, z: float = 0.0):
    return {"x": x, "y": y, "z": z}

def _neutral(n: int):
    return [lm(0.5, 0.5)] * n

# Left arm rest landmarks (used when a sign only specifies the right arm)
_L_REST_S = [0.65, 0.35]
_L_REST_E = [0.65, 0.52]
_L_REST_W = [0.65, 0.67]

def _body(rs, re, rw, ls=None, le=None, lw=None):
    """Build 33-element body array; only arm landmarks matter."""
    ls = ls or _L_REST_S
    le = le or _L_REST_E
    lw = lw or _L_REST_W
    b = _neutral(33)
    b[11] = lm(*rs)
    b[12] = lm(*ls)
    b[13] = lm(*re)
    b[14] = lm(*le)
    b[15] = lm(*rw)
    b[16] = lm(*lw)
    b[17] = lm(rw[0] - 0.02, rw[1] + 0.02)
    b[18] = lm(lw[0] + 0.02, lw[1] + 0.02)
    return b

# ── hand shapes ────────────────────────────────────────────────────────────

OPEN = [
    lm(0.50, 0.72),
    lm(0.38,0.65), lm(0.30,0.57), lm(0.24,0.49), lm(0.19,0.42),
    lm(0.43,0.61), lm(0.42,0.49), lm(0.42,0.38), lm(0.42,0.27),
    lm(0.50,0.59), lm(0.50,0.47), lm(0.50,0.36), lm(0.50,0.24),
    lm(0.57,0.61), lm(0.58,0.49), lm(0.58,0.38), lm(0.58,0.27),
    lm(0.63,0.64), lm(0.64,0.55), lm(0.64,0.47), lm(0.64,0.40),
]

FIST = [
    lm(0.50, 0.72),
    lm(0.40,0.66), lm(0.34,0.61), lm(0.31,0.68), lm(0.36,0.74),
    lm(0.53,0.65), lm(0.57,0.69), lm(0.56,0.75), lm(0.52,0.77),
    lm(0.50,0.64), lm(0.53,0.68), lm(0.52,0.74), lm(0.48,0.76),
    lm(0.47,0.65), lm(0.49,0.69), lm(0.47,0.75), lm(0.44,0.77),
    lm(0.43,0.67), lm(0.44,0.71), lm(0.43,0.76), lm(0.40,0.78),
]

POINT = [
    lm(0.50, 0.72),
    lm(0.40,0.66), lm(0.34,0.61), lm(0.31,0.68), lm(0.36,0.74),
    lm(0.50,0.63), lm(0.50,0.51), lm(0.50,0.39), lm(0.50,0.27),
    lm(0.52,0.64), lm(0.55,0.68), lm(0.54,0.74), lm(0.50,0.76),
    lm(0.47,0.65), lm(0.49,0.69), lm(0.47,0.75), lm(0.44,0.77),
    lm(0.43,0.67), lm(0.44,0.71), lm(0.43,0.76), lm(0.40,0.78),
]

FLAT = [
    lm(0.50, 0.72),
    lm(0.41,0.65), lm(0.36,0.58), lm(0.34,0.51), lm(0.34,0.44),
    lm(0.45,0.60), lm(0.45,0.49), lm(0.45,0.38), lm(0.45,0.27),
    lm(0.50,0.59), lm(0.50,0.48), lm(0.50,0.37), lm(0.50,0.26),
    lm(0.55,0.60), lm(0.55,0.49), lm(0.55,0.38), lm(0.55,0.27),
    lm(0.60,0.62), lm(0.60,0.53), lm(0.60,0.46), lm(0.60,0.39),
]

CHAND = [
    lm(0.50, 0.72),
    lm(0.38,0.63), lm(0.30,0.57), lm(0.26,0.51), lm(0.26,0.45),
    lm(0.42,0.59), lm(0.38,0.53), lm(0.37,0.48), lm(0.38,0.43),
    lm(0.50,0.57), lm(0.46,0.52), lm(0.45,0.47), lm(0.46,0.42),
    lm(0.58,0.59), lm(0.62,0.54), lm(0.63,0.49), lm(0.62,0.44),
    lm(0.64,0.62), lm(0.67,0.57), lm(0.68,0.53), lm(0.67,0.49),
]

NO_HAND: list = []

# ── arm positions (right shoulder always at 0.35,0.35) ─────────────────────

RS = [0.35, 0.35]

REST  = dict(rs=RS, re=[0.35,0.52], rw=[0.35,0.67])
HEAD  = dict(rs=RS, re=[0.28,0.22], rw=[0.33,0.10])
CHIN  = dict(rs=RS, re=[0.40,0.38], rw=[0.47,0.32])
CHEST = dict(rs=RS, re=[0.42,0.42], rw=[0.50,0.42])
FWD   = dict(rs=RS, re=[0.42,0.44], rw=[0.50,0.52])
SIDE  = dict(rs=RS, re=[0.22,0.38], rw=[0.10,0.42])
MID   = dict(rs=RS, re=[0.33,0.33], rw=[0.36,0.20])

def _arm(rs, re, rw):
    return dict(rs=rs, re=re, rw=rw)

def _f(arm, rhand=None, lhand=None):
    """Build one SignFrame dict."""
    return {
        "body":      _body(arm["rs"], arm["re"], arm["rw"]),
        "rightHand": rhand or NO_HAND,
        "leftHand":  lhand or NO_HAND,
    }

# ── hardcoded pose database ────────────────────────────────────────────────

BUILTIN_POSES: dict[str, list] = {
    "HELLO":       [_f(HEAD, OPEN), _f(_arm(RS,[0.27,0.20],[0.35,0.09]), OPEN), _f(HEAD, OPEN)],
    "ME":          [_f(CHEST, POINT)],
    "YOU":         [_f(FWD, POINT)],
    "GOOD":        [_f(CHIN, FLAT), _f(FWD, FLAT)],
    "YES":         [_f(CHIN, FIST), _f(CHEST, FIST), _f(CHIN, FIST)],
    "NO":          [_f(FWD, POINT), _f(_arm(RS,[0.44,0.42],[0.54,0.50]), POINT), _f(FWD, POINT)],
    "WANT":        [_f(FWD, CHAND), _f(CHEST, CHAND)],
    "HELP":        [_f(FWD, FIST), _f(MID, FIST), _f(CHIN, FIST)],
    "STOP":        [_f(SIDE, FLAT), _f(CHIN, FLAT)],
    "UNDERSTAND":  [_f(HEAD, POINT), _f(_arm(RS,[0.27,0.21],[0.32,0.09]), OPEN)],
    "WATER":       [_f(CHIN, OPEN), _f(_arm(RS,[0.39,0.37],[0.46,0.30]), OPEN), _f(CHIN, OPEN)],
    "EAT":         [_f(CHIN, FLAT), _f(_arm(RS,[0.40,0.35],[0.46,0.27]), FLAT), _f(CHIN, FLAT)],
    "SLEEP":       [_f(HEAD, FLAT), _f(_arm(RS,[0.30,0.22],[0.37,0.14]), FLAT)],
    "COME":        [_f(FWD, POINT), _f(CHEST, POINT)],
    "GO":          [_f(CHEST, POINT), _f(FWD, POINT), _f(SIDE, POINT)],
    "NAME":        [_f(CHIN, POINT), _f(_arm(RS,[0.42,0.37],[0.50,0.30]), POINT)],
    "WHAT":        [_f(FWD, OPEN), _f(_arm(RS,[0.45,0.43],[0.54,0.50]), OPEN), _f(FWD, OPEN)],
    "THANK_YOU":   [_f(CHIN, FLAT), _f(FWD, FLAT)],
    "PLEASE":      [_f(CHEST, FLAT), _f(_arm(RS,[0.43,0.41],[0.51,0.40]), FLAT), _f(CHEST, FLAT)],
    "KNOW":        [_f(HEAD, FLAT)],
    "NOT":         [_f(CHIN, FIST), _f(FWD, FIST)],
    "TIME-PAST":   [_f(_arm(RS,[0.28,0.30],[0.20,0.25]), OPEN)],
    "TIME-FUTURE": [_f(FWD, OPEN), _f(SIDE, OPEN)],
    "CAN":         [_f(FWD, FIST), _f(CHEST, FIST)],
    "WHERE":       [_f(MID, POINT), _f(SIDE, POINT), _f(MID, POINT)],
    # HOW — both palms open at chest, rotate/extend outward (questioning gesture)
    "HOW":         [_f(CHEST, OPEN), _f(FWD, OPEN), _f(CHEST, OPEN)],
    # WHY — index to temple, then flick forward
    "WHY":         [_f(HEAD, POINT), _f(_arm(RS,[0.30,0.24],[0.38,0.18]), POINT), _f(FWD, POINT)],
    # WHO — point near chin/lips and move forward
    "WHO":         [_f(CHIN, POINT), _f(FWD, POINT)],
    # WHEN — index at shoulder height, circle then point
    "WHEN":        [_f(MID, POINT), _f(_arm(RS,[0.38,0.30],[0.46,0.22]), POINT), _f(MID, POINT)],
    "HAVE":        [_f(CHEST, FIST), _f(FWD, FIST)],
    "NEED":        [_f(FWD, CHAND), _f(CHIN, CHAND)],
    "FEEL":        [_f(CHEST, OPEN)],
    "SICK":        [_f(HEAD, OPEN), _f(CHIN, OPEN)],
    "PAIN":        [_f(CHEST, FIST), _f(CHIN, FIST)],
    "DOCTOR":      [_f(CHIN, FLAT), _f(_arm(RS,[0.40,0.36],[0.48,0.28]), FLAT)],
    "HOSPITAL":    [_f(MID, OPEN), _f(HEAD, OPEN)],
    "POLICE":      [_f(CHIN, FIST), _f(CHEST, FIST)],
    "FIRE":        [_f(FWD, OPEN), _f(MID, OPEN), _f(FWD, OPEN)],
    "HELP-ME":     [_f(CHEST, FIST), _f(FWD, FIST), _f(CHIN, FIST)],
    "CALL":        [_f(CHIN, OPEN), _f(FWD, OPEN)],
    "HERE":        [_f(CHEST, POINT)],
    "OKAY":        [_f(CHIN, POINT)],
    "YES-NO":      [_f(FWD, OPEN), _f(CHIN, OPEN)],
}

GENERIC = [_f(FWD, OPEN), _f(CHEST, OPEN)]

# ── public API ─────────────────────────────────────────────────────────────

_pose_db: dict | None = None

def _load_db() -> dict:
    global _pose_db
    if _pose_db is not None:
        return _pose_db
    db_path = Path(__file__).parent.parent.parent / "data" / "pose_db.json"
    if db_path.exists():
        with open(db_path) as f:
            _pose_db = json.load(f)
    else:
        _pose_db = {}
    return _pose_db


def get_pose(word: str) -> list:
    """Return list of SignFrame dicts for a gloss word."""
    db = _load_db()
    key = word.upper()
    if key in db:
        frames = db[key]
        print(f"[pose] '{key}' → pose_db.json ({len(frames)} frames)")
        return frames
    if key in BUILTIN_POSES:
        frames = BUILTIN_POSES[key]
        print(f"[pose] '{key}' → builtin ({len(frames)} frames)")
        return frames
    print(f"[pose] '{key}' → GENERIC fallback (not in db or builtins)")
    return GENERIC
