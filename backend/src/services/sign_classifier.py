"""
ISL sign classifier — rule-based static hand-shape recognizer.

Design:
  The saved LSTM model expects a 19-dim feature vector whose exact
  engineering is not in the repo, so we don't trust it by default —
  any shape mismatch simply falls through to the rule classifier.
  The rule path is the primary recognizer.

Feature set per frame (all computed on a wrist-centred, scale-normalized
hand):
    5 extensions            — tip distance / MCP distance for each finger
    5 tip-to-palm distances — how far each tip is from the palm centre
    1 thumb-index pinch     — tight ring / OK sign disambiguator
    1 index-middle spread   — V sign vs. close pair
    1 palm orientation y    — whether the palm faces up, down, or sideways
    1 hand rotation (roll)  — how tilted the hand is
    1 is-thumb-across-palm  — FIST vs. A-hand
"""

from __future__ import annotations

import json as _json
from pathlib import Path as _Path
from typing import Optional

import numpy as np

# ── MediaPipe hand landmark indices ───────────────────────────────────────────
WRIST = 0
FINGER_TIP_IDS = [4, 8, 12, 16, 20]   # thumb, index, middle, ring, pinky
FINGER_MCP_IDS = [2, 5, 9, 13, 17]    # base knuckles
FINGER_PIP_IDS = [3, 6, 10, 14, 18]   # first joints


def _normalize(landmarks: list[list[float]]) -> np.ndarray:
    """Wrist-centred, scale-normalized landmarks. Uses wrist→middle-MCP as unit."""
    pts = np.array(landmarks, dtype=np.float32)   # (21, 3)
    wrist = pts[0].copy()
    pts -= wrist
    scale = float(np.linalg.norm(pts[9] - pts[0])) + 1e-6
    return pts / scale


def _extensions(pts: np.ndarray) -> np.ndarray:
    """
    5-element array: for each finger, ratio of tip-distance to MCP-distance
    from the wrist (in normalized space).

    > 1.5  -> clearly extended
    1.1-1.5 -> partially extended
    < 1.1  -> curled
    """
    exts = []
    for tip_i, mcp_i in zip(FINGER_TIP_IDS, FINGER_MCP_IDS):
        t = float(np.linalg.norm(pts[tip_i]))
        m = float(np.linalg.norm(pts[mcp_i])) + 1e-6
        exts.append(t / m)
    return np.array(exts, dtype=np.float32)


def _pinch(pts: np.ndarray) -> float:
    """Thumb-tip to index-tip distance (normalized)."""
    return float(np.linalg.norm(pts[4] - pts[8]))


def _spread_idx_mid(pts: np.ndarray) -> float:
    """Index-tip to middle-tip distance — large = V sign, small = together."""
    return float(np.linalg.norm(pts[8] - pts[12]))


def _palm_y(pts: np.ndarray) -> float:
    """Mean y of fingertips (normalized). Negative = palm up/fingers point up."""
    return float(np.mean(pts[FINGER_TIP_IDS, 1]))


def _thumb_across_palm(pts: np.ndarray) -> bool:
    """True if the thumb tip sits between the other MCPs and the palm centre —
    i.e. A-hand / FIST. False for thumb sticking out (HELP / GOOD)."""
    palm_centre = pts[[5, 9, 13, 17]].mean(axis=0)
    thumb_tip = pts[4]
    # thumb tip closer to palm centre than the mean MCP distance → tucked in
    tuck_dist = float(np.linalg.norm(thumb_tip[:2] - palm_centre[:2]))
    mcp_dist = float(np.linalg.norm(pts[5, :2] - palm_centre[:2]))
    return tuck_dist < mcp_dist * 1.1


def _hand_roll(pts: np.ndarray) -> float:
    """Signed rotation of the index-MCP-to-pinky-MCP axis (radians, -π..π)."""
    v = pts[17, :2] - pts[5, :2]
    return float(np.arctan2(v[1], v[0]))


# ── Rule-based classifier ─────────────────────────────────────────────────────

def _rule_classify(pts: np.ndarray) -> tuple[Optional[str], float]:
    """
    Static hand-shape → ISL gloss. Returns (label, confidence ∈ [0,1]).
    Rules are ordered from most specific to least specific so earlier matches
    win. All thresholds are tuned for MediaPipe Hands normalized output.
    """
    e = _extensions(pts)
    thumb, idx, mid, ring, pinky = e
    pinch = _pinch(pts)
    spread = _spread_idx_mid(pts)
    palm_y = _palm_y(pts)
    tuck = _thumb_across_palm(pts)

    # Boolean fingers
    ext = lambda x: x > 1.50
    cur = lambda x: x < 1.20
    mid_open = [ext(idx), ext(mid), ext(ring), ext(pinky)]
    mid_cur = [cur(idx), cur(mid), cur(ring), cur(pinky)]
    n_open = sum(mid_open)
    n_cur = sum(mid_cur)
    thumb_out = thumb > 1.45 and not tuck

    # ── Numbers 1–5 (counting: just count extended non-thumb fingers) ────────
    if not thumb_out:
        if [ext(idx), ext(mid), ext(ring), ext(pinky)] == [True, False, False, False]:
            return "ONE", 0.80
        if [ext(idx), ext(mid), ext(ring), ext(pinky)] == [True, True, False, False]:
            return "TWO", 0.80
        if [ext(idx), ext(mid), ext(ring), ext(pinky)] == [True, True, True, False]:
            return "THREE", 0.75
        if mid_open == [True, True, True, True] and not thumb_out:
            return "FOUR", 0.78
    if n_open == 4 and thumb_out:
        return "FIVE", 0.82

    # ── Pointing: index only ─────────────────────────────────────────────────
    if ext(idx) and cur(mid) and cur(ring) and cur(pinky):
        if pts[8, 2] < -0.3:  # index tip far forward → YOU (pointing toward)
            return "YOU", 0.75
        return "ONE", 0.72

    # ── V sign (index + middle, well spread) ─────────────────────────────────
    if ext(idx) and ext(mid) and cur(ring) and cur(pinky) and spread > 0.5:
        return "PEACE", 0.80   # also "two" in some conventions

    # ── I-L-Y: thumb + index + pinky extended, middle + ring curled ───────────
    if thumb_out and ext(idx) and cur(mid) and cur(ring) and ext(pinky):
        return "I_LOVE_YOU", 0.85

    # ── OK / PINCH: thumb-index circle, other three open ─────────────────────
    if pinch < 0.30 and ext(mid) and ext(ring):
        return "OKAY", 0.82

    # ── C-shape / WANT: fingers curved (not fully curled), thumb curved ──────
    if 0.40 < pinch < 0.80 and all(1.10 < x < 1.60 for x in [idx, mid, ring, pinky]):
        return "WANT", 0.68

    # ── THUMBS UP / GOOD: thumb extended, all four others tucked ─────────────
    if thumb > 1.55 and n_cur == 4 and not tuck:
        return "GOOD", 0.85

    # ── THUMBS DOWN / BAD: hand rotated, same shape as GOOD but inverted ─────
    # We can't reliably distinguish without palm normal in 3D; approximate via
    # thumb tip being LOWER than the wrist (large positive y).
    if thumb > 1.55 and n_cur == 4 and pts[4, 1] > 0.7:
        return "BAD", 0.70

    # ── FIST (all four curled, thumb tucked) ─────────────────────────────────
    if n_cur == 4 and tuck:
        return "YES", 0.80

    # ── OPEN PALM variants ──────────────────────────────────────────────────
    if n_open == 4 and thumb_out:
        # Palm up (fingers point upward in image): HELLO
        if palm_y < -0.7:
            return "HELLO", 0.82
        # Palm forward (fingers roughly level): STOP
        if palm_y > -0.4:
            return "STOP", 0.78
        # Default open hand
        return "HELLO", 0.68

    # ── Four fingers open, thumb tucked: THANK_YOU (flat hand at chin) ───────
    if n_open == 4 and not thumb_out:
        return "THANK_YOU", 0.68

    # ── Horns / ROCK: index + pinky extended ─────────────────────────────────
    if ext(idx) and cur(mid) and cur(ring) and ext(pinky) and not thumb_out:
        return "WATER", 0.72   # reused glyph — 'J' or 'water' in various ISL dialects

    # ── Pinch partial / ME / NAME: thumb+index close, middle curled ──────────
    if pinch < 0.45 and cur(mid) and cur(ring) and cur(pinky):
        return "ME", 0.62

    # ── HELP: thumbs-up on palm (fist with thumb up, other hand under) ───────
    # We can detect the thumb+fist configuration — same as GOOD but lower conf
    if thumb_out and n_cur >= 3:
        return "HELP", 0.55

    # ── SORRY / PLEASE: flat hand over chest — approximated by open palm ─────
    if n_open >= 3 and palm_y > -0.5:
        return "PLEASE", 0.50

    # ── Last-resort UNKNOWN hand visible ─────────────────────────────────────
    return None, 0.0


# ── Public API ────────────────────────────────────────────────────────────────

def classify_sign_scored(
    landmarks: list[list[float]],
) -> tuple[Optional[str], float]:
    if len(landmarks) < 21:
        return None, 0.0
    try:
        pts = _normalize(landmarks)
        return _rule_classify(pts)
    except Exception:
        return None, 0.0


def classify_sign(
    landmarks: list[list[float]],
    threshold: float = 0.55,
) -> Optional[str]:
    sign, score = classify_sign_scored(landmarks)
    return sign if score >= threshold else None


# ── Sequence classifier (LSTM preferred, rule-majority fallback) ─────────────

_LSTM_MODEL = None
_LSTM_LABELS: list[str] = []
_LSTM_SEQ_LEN: int = 30
_LSTM_FEAT_DIM: int = 63
_LSTM_LOAD_ATTEMPTED = False


def _load_lstm():
    global _LSTM_MODEL, _LSTM_LABELS, _LSTM_SEQ_LEN, _LSTM_FEAT_DIM, _LSTM_LOAD_ATTEMPTED
    if _LSTM_LOAD_ATTEMPTED:
        return _LSTM_MODEL
    _LSTM_LOAD_ATTEMPTED = True
    models_dir = _Path(__file__).resolve().parent.parent.parent / "models"
    h5 = models_dir / "lstm_sign.h5"
    meta = models_dir / "lstm_labels.json"
    if not h5.exists() or not meta.exists():
        return None
    try:
        from tensorflow.keras.models import load_model  # noqa: WPS433
        _LSTM_MODEL = load_model(str(h5), compile=False)
        info = _json.loads(meta.read_text())
        _LSTM_LABELS = info["labels"]
        _LSTM_SEQ_LEN = int(info.get("seq_len", 16))
        _LSTM_FEAT_DIM = int(info.get("feat_dim", 63))
    except Exception as e:
        print(f"[sign_classifier] LSTM load failed (falling back to rules): {e}")
        _LSTM_MODEL = None
    return _LSTM_MODEL


def classify_sequence_scored(
    frames: list[list[list[float]]],
) -> tuple[Optional[str], float]:
    """Window of landmark frames → (label, confidence)."""
    if not frames:
        return None, 0.0

    # Try LSTM; any shape / dtype issue silently falls through to rules
    model = _load_lstm()
    if model is not None and _LSTM_FEAT_DIM == 63:
        try:
            feats = []
            for frame in frames:
                if len(frame) < 21:
                    feats.append(np.zeros(_LSTM_FEAT_DIM, dtype=np.float32))
                    continue
                feats.append(_normalize(frame).flatten())
            if feats:
                arr = np.stack(feats).astype(np.float32)
                if len(arr) != _LSTM_SEQ_LEN:
                    idx = np.linspace(0, len(arr) - 1, _LSTM_SEQ_LEN).round().astype(int)
                    arr = arr[idx]
                probs = model.predict(arr[None, ...], verbose=0)[0]
                top = int(np.argmax(probs))
                conf = float(probs[top])
                if conf >= 0.55 and top < len(_LSTM_LABELS):
                    return _LSTM_LABELS[top], conf
        except Exception as e:
            print(f"[sign_classifier] LSTM predict skipped: {e}")

    # Majority vote over the frame window
    votes: dict[str, float] = {}
    for frame in frames:
        sign, conf = classify_sign_scored(frame)
        if sign and conf > 0:
            votes[sign] = votes.get(sign, 0.0) + conf

    if not votes:
        return None, 0.0

    best = max(votes, key=lambda k: votes[k])
    avg_conf = votes[best] / len(frames)
    return best, min(avg_conf, 0.95)


def classify_sequence(
    frames: list[list[list[float]]],
    threshold: float = 0.25,
) -> Optional[str]:
    label, conf = classify_sequence_scored(frames)
    return label if conf >= threshold else None
