"""
Pose lookup service — maps ISL gloss tokens to SignFrame sequences.

Each SignFrame has:
  body: 33 landmarks (MediaPipe Pose) — only [11-18] used for arms
  rightHand: 21 landmarks (MediaPipe Hand)
  leftHand: 21 landmarks (MediaPipe Hand)

Coordinates: MediaPipe normalized [0,1], origin top-left.
landmarkToVec3 on frontend: x->(x-0.5)*s, y->-(y-0.5)*s

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

# Index + middle extended, rest curled — V-sign / peace / victory / "TWO"
V_SIGN = [
    lm(0.50, 0.72),
    lm(0.40,0.66), lm(0.34,0.61), lm(0.31,0.68), lm(0.36,0.74),
    lm(0.46,0.62), lm(0.45,0.48), lm(0.44,0.36), lm(0.43,0.24),
    lm(0.54,0.62), lm(0.55,0.48), lm(0.56,0.36), lm(0.57,0.24),
    lm(0.47,0.65), lm(0.49,0.69), lm(0.47,0.75), lm(0.44,0.77),
    lm(0.43,0.67), lm(0.44,0.71), lm(0.43,0.76), lm(0.40,0.78),
]

# Thumb + index extended (gun-shape) — THREE / "L" handshape
L_HAND = [
    lm(0.50, 0.72),
    lm(0.30,0.68), lm(0.22,0.64), lm(0.16,0.58), lm(0.12,0.52),
    lm(0.50,0.63), lm(0.50,0.51), lm(0.50,0.39), lm(0.50,0.27),
    lm(0.52,0.64), lm(0.55,0.68), lm(0.54,0.74), lm(0.50,0.76),
    lm(0.47,0.65), lm(0.49,0.69), lm(0.47,0.75), lm(0.44,0.77),
    lm(0.43,0.67), lm(0.44,0.71), lm(0.43,0.76), lm(0.40,0.78),
]

# Thumb + pinky extended — "Y"/hang-loose/CALL handshape
Y_HAND = [
    lm(0.50, 0.72),
    lm(0.30,0.68), lm(0.22,0.62), lm(0.16,0.56), lm(0.12,0.50),
    lm(0.46,0.62), lm(0.45,0.66), lm(0.45,0.72), lm(0.45,0.76),
    lm(0.50,0.62), lm(0.50,0.66), lm(0.50,0.72), lm(0.50,0.76),
    lm(0.54,0.62), lm(0.55,0.66), lm(0.55,0.72), lm(0.55,0.76),
    lm(0.63,0.60), lm(0.69,0.52), lm(0.73,0.44), lm(0.76,0.38),
]

# Thumb up, fingers curled — "GOOD"/approval
THUMB_UP = [
    lm(0.50, 0.72),
    lm(0.50,0.58), lm(0.50,0.46), lm(0.50,0.36), lm(0.50,0.28),
    lm(0.46,0.62), lm(0.45,0.66), lm(0.45,0.72), lm(0.45,0.76),
    lm(0.50,0.62), lm(0.50,0.66), lm(0.50,0.72), lm(0.50,0.76),
    lm(0.54,0.62), lm(0.55,0.66), lm(0.55,0.72), lm(0.55,0.76),
    lm(0.58,0.62), lm(0.58,0.66), lm(0.58,0.72), lm(0.58,0.76),
]

NO_HAND: list = []

# ── arm positions (right shoulder always at 0.35,0.35) ─────────────────────

RS = [0.35, 0.35]
LS_ANCHOR = [0.65, 0.35]   # left shoulder (mirror of RS across x=0.5)

# ── right-arm anchors ────────────────────────────────────────────────────
REST  = dict(rs=RS, re=[0.35,0.52], rw=[0.35,0.67])
HEAD  = dict(rs=RS, re=[0.28,0.22], rw=[0.33,0.10])
CHIN  = dict(rs=RS, re=[0.40,0.38], rw=[0.47,0.32])
CHEST = dict(rs=RS, re=[0.42,0.42], rw=[0.50,0.42])
FWD   = dict(rs=RS, re=[0.42,0.44], rw=[0.50,0.52])
SIDE  = dict(rs=RS, re=[0.22,0.38], rw=[0.10,0.42])
MID   = dict(rs=RS, re=[0.33,0.33], rw=[0.36,0.20])
HIGH  = dict(rs=RS, re=[0.35,0.25], rw=[0.40,0.15])
LOW   = dict(rs=RS, re=[0.38,0.50], rw=[0.45,0.60])
CROSS = dict(rs=RS, re=[0.45,0.42], rw=[0.55,0.45])
EAR   = dict(rs=RS, re=[0.30,0.25], rw=[0.36,0.15])
MOUTH = dict(rs=RS, re=[0.40,0.36], rw=[0.45,0.28])
SHOULDER = dict(rs=RS, re=[0.33,0.32], rw=[0.30,0.28])

# ── left-arm anchors (mirror of right, across x = 0.5) ───────────────────
def _mirror(a: dict) -> dict:
    """Mirror a right-arm anchor dict into a left-arm anchor dict."""
    def m(p): return [round(1.0 - p[0], 4), p[1]]
    return dict(ls=m(a["rs"]), le=m(a["re"]), lw=m(a["rw"]))

L_REST     = _mirror(REST)
L_HEAD     = _mirror(HEAD)
L_CHIN     = _mirror(CHIN)
L_CHEST    = _mirror(CHEST)
L_FWD      = _mirror(FWD)
L_SIDE     = _mirror(SIDE)
L_MID      = _mirror(MID)
L_HIGH     = _mirror(HIGH)
L_LOW      = _mirror(LOW)
L_CROSS    = _mirror(CROSS)   # left arm reaching across to the right side
L_EAR      = _mirror(EAR)
L_MOUTH    = _mirror(MOUTH)
L_SHOULDER = _mirror(SHOULDER)

def _arm(rs, re, rw):
    return dict(rs=rs, re=re, rw=rw)


def _f(arm, rhand=None, lhand=None, larm=None):
    """Build one SignFrame dict.

    Args:
        arm:   right-arm anchor (dict with rs/re/rw)
        rhand: optional right-hand shape (21 landmarks)
        lhand: optional left-hand shape (21 landmarks) — when set, this is a
               two-handed sign and a default active left-arm anchor is used
               unless the caller passes `larm` explicitly.
        larm:  optional left-arm anchor (dict with ls/le/lw). If omitted and
               `lhand` was provided, the left arm mirrors the right anchor so
               the two hands come together naturally at chest.
    """
    # Default left arm: rest position unless either lhand or larm is provided
    if larm is None and lhand:
        # mirror the right-arm anchor across x=0.5 so both hands meet
        larm = {
            "ls": [round(1.0 - arm["rs"][0], 4), arm["rs"][1]],
            "le": [round(1.0 - arm["re"][0], 4), arm["re"][1]],
            "lw": [round(1.0 - arm["rw"][0], 4), arm["rw"][1]],
        }

    if larm is None:
        return {
            "body":      _body(arm["rs"], arm["re"], arm["rw"]),
            "rightHand": rhand or NO_HAND,
            "leftHand":  lhand or NO_HAND,
        }

    return {
        "body": _body(
            arm["rs"], arm["re"], arm["rw"],
            ls=larm["ls"], le=larm["le"], lw=larm["lw"],
        ),
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
    # HELP — both hands together, right fist rests on left flat palm, lifts up
    "HELP":        [
        _f(CHEST, FIST, lhand=FLAT, larm=L_CHEST),
        _f(CHIN,  FIST, lhand=FLAT, larm=L_CHIN),
    ],
    # STOP — right flat hand chops down onto left flat palm
    "STOP":        [
        _f(HIGH,  FLAT, lhand=FLAT, larm=L_CHEST),
        _f(CHEST, FLAT, lhand=FLAT, larm=L_CHEST),
    ],
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
    # HELP-ME — same as HELP but lifts toward self urgently (both hands)
    "HELP-ME":     [
        _f(CHEST, FIST, lhand=FLAT, larm=L_CHEST),
        _f(CHIN,  FIST, lhand=FLAT, larm=L_CHIN),
        _f(CHEST, FIST, lhand=FLAT, larm=L_CHEST),
    ],
    "CALL":        [_f(CHIN, OPEN), _f(FWD, OPEN)],
    "HERE":        [_f(CHEST, POINT)],
    "OKAY":        [_f(CHIN, POINT)],
    "YES-NO":      [_f(FWD, OPEN), _f(CHIN, OPEN)],

    # ── Pronouns & people ──────────────────────────────────────────────────
    "I":           [_f(CHEST, POINT)],
    "MY":          [_f(CHEST, FLAT)],
    "MINE":        [_f(CHEST, FLAT)],
    "OUR":         [_f(SHOULDER, FLAT), _f(CHEST, FLAT), _f(_arm(RS,[0.42,0.38],[0.52,0.40]), FLAT)],
    "WE":          [_f(CHEST, POINT), _f(SIDE, POINT)],
    "THEY":        [_f(FWD, POINT), _f(SIDE, POINT)],
    "HE":          [_f(FWD, POINT)],
    "SHE":         [_f(FWD, POINT)],
    "PEOPLE":      [_f(CHEST, POINT), _f(FWD, POINT), _f(SIDE, POINT)],
    # FRIEND — two "hook" index fingers interlock, then swap — both hands active
    "FRIEND":      [
        _f(CHEST, V_SIGN, lhand=V_SIGN, larm=L_CHEST),
        _f(CHIN,  V_SIGN, lhand=V_SIGN, larm=L_CHIN),
    ],
    # FAMILY — F-hands trace a circle, both hands visible
    "FAMILY":      [
        _f(CHEST, CHAND, lhand=CHAND, larm=L_CHEST),
        _f(FWD,   CHAND, lhand=CHAND, larm=L_FWD),
        _f(CHEST, CHAND, lhand=CHAND, larm=L_CHEST),
    ],
    # TEAM — two cupped hands meet at center
    "TEAM":        [
        _f(CHEST, FIST, lhand=FIST, larm=L_CHEST),
        _f(FWD,   FIST, lhand=FIST, larm=L_FWD),
    ],
    "JUDGE":       [_f(CHIN, FIST), _f(FWD, FIST)],

    # ── Deaf community vocabulary ──────────────────────────────────────────
    "DEAF":        [_f(EAR, POINT), _f(MOUTH, POINT)],
    "HEARING":     [_f(MOUTH, POINT), _f(EAR, POINT)],
    "SIGN":        [_f(CHEST, POINT), _f(FWD, POINT), _f(CHEST, POINT)],
    "LANGUAGE":    [_f(CHIN, L_HAND), _f(SIDE, L_HAND)],
    "VOICE":       [_f(MOUTH, OPEN), _f(FWD, OPEN)],
    "SPEAK":       [_f(MOUTH, CHAND), _f(FWD, CHAND)],
    "TALK":        [_f(MOUTH, POINT), _f(FWD, POINT), _f(MOUTH, POINT)],
    "LISTEN":      [_f(EAR, CHAND), _f(_arm(RS,[0.30,0.26],[0.34,0.18]), CHAND)],
    "SEE":         [_f(HEAD, V_SIGN), _f(FWD, V_SIGN)],
    "WATCH":       [_f(HEAD, V_SIGN), _f(FWD, V_SIGN)],
    # COMMUNICATE — two "C"-hands alternate in/out from mouth (two-handed)
    "COMMUNICATE": [
        _f(MOUTH, CHAND, lhand=CHAND, larm=L_MOUTH),
        _f(FWD,   CHAND, lhand=CHAND, larm=L_FWD),
        _f(MOUTH, CHAND, lhand=CHAND, larm=L_MOUTH),
    ],
    # TRANSLATE — two cupped hands swap positions, mimicking "flipping" language
    "TRANSLATE":   [
        _f(CHEST, FIST, lhand=FIST, larm=L_CHEST),
        _f(FWD,   FIST, lhand=FIST, larm=L_FWD),
        _f(CHEST, FIST, lhand=FIST, larm=L_CHEST),
    ],

    # ── Product / pitch words ──────────────────────────────────────────────
    # SONOROUS — big two-handed "wave" reveal, palms open wide
    "SONOROUS":    [
        _f(CHEST, OPEN, lhand=OPEN, larm=L_CHEST),
        _f(HIGH,  OPEN, lhand=OPEN, larm=L_HIGH),
        _f(SIDE,  OPEN, lhand=OPEN, larm=L_SIDE),
    ],
    "APP":         [_f(CHEST, POINT), _f(FWD, POINT)],
    "TECH":        [_f(HEAD, Y_HAND), _f(FWD, Y_HAND)],
    "AI":          [_f(HEAD, POINT), _f(HIGH, POINT)],
    "MODEL":       [_f(CHEST, FIST), _f(FWD, FIST), _f(CHEST, FIST)],
    "DEMO":        [_f(CHEST, FLAT), _f(FWD, FLAT), _f(SIDE, FLAT)],
    "SHOW":        [_f(CHEST, POINT), _f(FWD, FLAT)],
    "IDEA":        [_f(HEAD, POINT), _f(HIGH, POINT)],
    "PROBLEM":     [_f(CHEST, FIST), _f(CHIN, FIST), _f(CHEST, FIST)],
    "SOLUTION":    [_f(HEAD, POINT), _f(FWD, OPEN)],
    "ANSWER":      [_f(CHIN, POINT), _f(FWD, POINT)],
    "QUESTION":    [_f(FWD, POINT)],
    "FEATURE":     [_f(CHEST, OPEN), _f(FWD, OPEN)],
    "PROJECT":     [_f(HIGH, OPEN), _f(FWD, OPEN)],
    # BUILD — two fists stacking upward (hand-over-hand brick-laying)
    "BUILD":       [
        _f(LOW,   FIST, lhand=FIST, larm=L_LOW),
        _f(CHEST, FIST, lhand=FIST, larm=L_CHEST),
        _f(HIGH,  FIST, lhand=FIST, larm=L_HIGH),
    ],
    "WORK":        [_f(CHEST, FIST), _f(_arm(RS,[0.38,0.40],[0.45,0.45]), FIST), _f(CHEST, FIST)],
    "MAKE":        [_f(CHEST, FIST), _f(FWD, FIST)],
    "CREATE":      [_f(CHEST, FIST), _f(FWD, FLAT)],
    "START":       [_f(CHEST, POINT), _f(FWD, POINT)],
    "STOP-NOW":    [_f(SIDE, FLAT), _f(CHIN, FLAT)],
    "FINISH":      [_f(CHIN, FLAT), _f(FWD, FLAT)],
    "DONE":        [_f(CHIN, FLAT), _f(FWD, FLAT)],
    "READY":       [_f(CHEST, THUMB_UP), _f(FWD, THUMB_UP)],

    # ── Impact / emotional / qualifiers ────────────────────────────────────
    # CHANGE — fists swap positions (two-handed motion)
    "CHANGE":      [
        _f(CHEST, FIST, lhand=FIST, larm=L_CHEST),
        _f(
            dict(rs=RS, re=[0.42,0.40], rw=[0.50,0.42]),
            FIST,
            lhand=FIST,
            larm=dict(ls=L_CHEST["ls"], le=[0.58,0.40], lw=[0.50,0.42]),
        ),
        _f(CHEST, FIST, lhand=FIST, larm=L_CHEST),
    ],
    "BETTER":      [_f(MOUTH, FLAT), _f(HIGH, THUMB_UP)],
    "BEST":        [_f(HIGH, THUMB_UP), _f(CHEST, THUMB_UP)],
    "EASY":        [_f(CHEST, V_SIGN), _f(FWD, V_SIGN)],
    "HARD":        [_f(CHEST, FIST), _f(FWD, FIST)],
    "FAST":        [_f(CHEST, POINT), _f(FWD, POINT), _f(SIDE, POINT)],
    "SLOW":        [_f(FWD, FLAT), _f(CHEST, FLAT)],
    "BIG":         [_f(CHEST, OPEN), _f(SIDE, OPEN)],
    "SMALL":       [_f(CHEST, CHAND)],
    "NEW":         [_f(CHEST, OPEN), _f(FWD, OPEN)],
    "OLD":         [_f(CHIN, FIST), _f(CHEST, FIST)],
    # LOVE — arms crossed over chest (both hands, hugging self)
    "LOVE":        [
        _f(CHEST, FIST, lhand=FIST, larm=dict(ls=L_CHEST["ls"], le=[0.44,0.42], lw=[0.42,0.46])),
        _f(
            dict(rs=RS, re=[0.56,0.42], rw=[0.58,0.46]),
            FIST,
            lhand=FIST,
            larm=dict(ls=L_CHEST["ls"], le=[0.44,0.42], lw=[0.42,0.46]),
        ),
    ],
    "HAPPY":       [_f(CHEST, OPEN), _f(HIGH, OPEN), _f(CHEST, OPEN)],
    "SAD":         [_f(HEAD, OPEN), _f(CHIN, OPEN), _f(CHEST, OPEN)],

    # ── Safety-ish (reused by pitch: "we can alert a deaf user when…") ────
    "ALERT":       [_f(HEAD, POINT), _f(FWD, POINT), _f(HEAD, POINT)],
    "WARN":        [_f(FWD, FLAT), _f(CHEST, FLAT), _f(FWD, FLAT)],
    "DANGER":      [_f(HEAD, FIST), _f(CHEST, FIST)],
    "SAFE":        [_f(CHEST, FIST), _f(FWD, FIST)],
    # EMERGENCY — both hands fist, lift up alternately (distress gesture)
    "EMERGENCY":   [
        _f(HIGH,  FIST, lhand=FIST, larm=L_HIGH),
        _f(CHEST, FIST, lhand=FIST, larm=L_CHEST),
        _f(HIGH,  FIST, lhand=FIST, larm=L_HIGH),
    ],
    "SOUND":       [_f(EAR, CHAND), _f(FWD, CHAND)],
    "LEARN":       [_f(FWD, FLAT), _f(HEAD, FIST)],
    "TEACH":       [_f(HEAD, FIST), _f(FWD, FIST)],
    "KNOW-MORE":   [_f(HEAD, FLAT), _f(FWD, FLAT)],

    # ── Social / closing ───────────────────────────────────────────────────
    # WELCOME — both hands sweep outward from chest with open palms
    "WELCOME":     [
        _f(CHEST, OPEN, lhand=OPEN, larm=L_CHEST),
        _f(FWD,   OPEN, lhand=OPEN, larm=L_FWD),
        _f(SIDE,  OPEN, lhand=OPEN, larm=L_SIDE),
    ],
    "GOODBYE":     [_f(HIGH, OPEN), _f(SIDE, OPEN), _f(HIGH, OPEN)],
    "BYE":         [_f(HIGH, OPEN), _f(SIDE, OPEN)],
    "THANKS":      [_f(CHIN, FLAT), _f(FWD, FLAT)],

    # ── Numbers 1–10 (fingerspell-style) ───────────────────────────────────
    "ONE":         [_f(CHEST, POINT)],
    "TWO":         [_f(CHEST, V_SIGN)],
    "THREE":       [_f(CHEST, L_HAND)],
    "FOUR":        [_f(CHEST, OPEN)],   # 4 fingers, thumb tucked — approximated by OPEN
    "FIVE":        [_f(CHEST, OPEN)],
    "SIX":         [_f(CHEST, Y_HAND)],
    "SEVEN":       [_f(CHEST, Y_HAND)],
    "EIGHT":       [_f(CHEST, L_HAND)],
    "NINE":        [_f(CHEST, POINT)],
    "TEN":         [_f(CHEST, THUMB_UP)],
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
        print(f"[pose] '{key}' -> pose_db.json ({len(frames)} frames)")
        return frames
    if key in BUILTIN_POSES:
        frames = BUILTIN_POSES[key]
        print(f"[pose] '{key}' -> builtin ({len(frames)} frames)")
        return frames
    print(f"[pose] '{key}' -> GENERIC fallback (not in db or builtins)")
    return GENERIC
