"""
ISL sign classifier — rule-based extension ratios.

Primary: finger-extension rules (thumb, index, middle, ring, pinky).
These are robust to camera distance, lighting, and hand orientation because
the features are ratios within the same normalized hand frame.

Fallback: cosine similarity on the same 5-extension feature for unknown shapes.

MediaPipe hand indices:
  0=wrist  1-4=thumb  5-8=index  9-12=middle  13-16=ring  17-20=pinky
  MCP (knuckle base): 1, 5, 9, 13, 17
  TIP (fingertip):    4, 8, 12, 16, 20
  PIP (first joint):  3, 6, 10, 14, 18
"""

import numpy as np
from typing import Optional

FINGER_TIP_IDS = [4, 8, 12, 16, 20]   # thumb, index, middle, ring, pinky
FINGER_MCP_IDS = [2, 5, 9,  13, 17]   # base knuckles


def _normalize(landmarks: list[list[float]]) -> np.ndarray:
    pts = np.array(landmarks, dtype=np.float32)   # (21, 3)
    wrist = pts[0].copy()
    pts -= wrist
    scale = float(np.linalg.norm(pts[9] - pts[0])) + 1e-6   # middle-MCP dist
    return pts / scale


def _extensions(pts: np.ndarray) -> np.ndarray:
    """
    5-element array: for each finger, ratio of tip-distance to MCP-distance
    from the wrist (in normalized space).

    > 1.5  → clearly extended
    1.1–1.5 → partially extended
    < 1.1  → curled
    """
    exts = []
    for tip_i, mcp_i in zip(FINGER_TIP_IDS, FINGER_MCP_IDS):
        t = float(np.linalg.norm(pts[tip_i]))
        m = float(np.linalg.norm(pts[mcp_i])) + 1e-6
        exts.append(t / m)
    return np.array(exts, dtype=np.float32)   # [thumb, idx, mid, ring, pinky]


def _pinch_dist(pts: np.ndarray) -> float:
    """Thumb-tip to index-tip distance (normalized)."""
    return float(np.linalg.norm(pts[4] - pts[8]))


def _palm_y(pts: np.ndarray) -> float:
    """Mean y of fingertip positions. Positive y = lower in image = curled."""
    return float(np.mean(pts[FINGER_TIP_IDS, 1]))


# ── Rule-based classifier ─────────────────────────────────────────────────────

def _rule_classify(pts: np.ndarray) -> tuple[Optional[str], float]:
    """
    Returns (sign, confidence) using geometric rules on the normalized hand.
    Confidence is a heuristic [0, 1] not a probability.
    """
    e = _extensions(pts)
    thumb, idx, mid, ring, pinky = e
    pinch = _pinch_dist(pts)

    fingers_open  = [idx > 1.50, mid > 1.50, ring > 1.50, pinky > 1.50]
    fingers_curled = [idx < 1.20, mid < 1.20, ring < 1.20, pinky < 1.20]
    n_open   = sum(fingers_open)
    n_curled = sum(fingers_curled)

    # ── Open hand / HELLO / STOP (all four fingers extended) ─────────────────
    if n_open >= 4 and thumb > 1.3:
        return "HELLO", 0.82

    if n_open >= 4:
        return "STOP", 0.72

    # ── Fist / YES / NO (all four fingers curled) ────────────────────────────
    if n_curled >= 4 and thumb < 1.35:
        return "YES", 0.75

    # ── Pointing (index only extended) ───────────────────────────────────────
    if idx > 1.55 and mid < 1.25 and ring < 1.25 and pinky < 1.25:
        return "YOU", 0.80

    # ── V-sign / UNDERSTAND (index + middle, ring + pinky curled) ────────────
    if idx > 1.50 and mid > 1.50 and ring < 1.30 and pinky < 1.30:
        return "UNDERSTAND", 0.78

    # ── Thumbs-up (thumb extended, all fingers curled) ────────────────────────
    if thumb > 1.60 and n_curled >= 4:
        return "GOOD", 0.80

    # ── OK / pinch (thumb–index very close, middle–pinky open) ───────────────
    if pinch < 0.25 and mid > 1.40 and ring > 1.30:
        return "OKAY", 0.75

    # ── C-shape / WANT (all fingers curved, pinch ~medium) ───────────────────
    if 0.30 < pinch < 0.65 and all(1.15 < x < 1.65 for x in [idx, mid, ring, pinky]):
        return "WANT", 0.68

    # ── Flat hand / THANK_YOU (fingers extended, close together) ─────────────
    if n_open >= 3 and thumb < 1.4 and pinch > 0.40:
        return "THANK_YOU", 0.65

    # ── ME (pointing inward — index extended, palm faces self) ───────────────
    if idx > 1.55 and mid < 1.30 and ring < 1.30 and thumb > 1.3:
        return "ME", 0.65

    # ── HELP (fist with thumb raised to side) ────────────────────────────────
    if thumb > 1.50 and 2 <= n_curled <= 4:
        return "HELP", 0.62

    # ── WATER / two fingers (index + pinky, middle + ring curled) ─────────────
    if idx > 1.50 and pinky > 1.50 and mid < 1.30 and ring < 1.30:
        return "WATER", 0.70

    # ── KNOW / flat hand touching head (coded same as flat) ──────────────────
    if n_open >= 3 and not (mid > 1.50 and ring > 1.50 and pinky > 1.50):
        return "KNOW", 0.55

    return None, 0.0


# ── Public API ────────────────────────────────────────────────────────────────

def classify_sign_scored(
    landmarks: list[list[float]],
) -> tuple[Optional[str], float]:
    """Return (sign, confidence) for a single frame."""
    if len(landmarks) < 21:
        return None, 0.0
    pts = _normalize(landmarks)
    return _rule_classify(pts)


def classify_sign(
    landmarks: list[list[float]],
    threshold: float = 0.60,
) -> Optional[str]:
    sign, score = classify_sign_scored(landmarks)
    return sign if score >= threshold else None


# ── Sequence classifier ───────────────────────────────────────────────────────

import json as _json
from pathlib import Path as _Path

_LSTM_MODEL = None
_LSTM_LABELS: list[str] = []
_LSTM_SEQ_LEN: int = 16
_LSTM_FEAT_DIM: int = 5
_LSTM_LOAD_ATTEMPTED = False


def _load_lstm():
    global _LSTM_MODEL, _LSTM_LABELS, _LSTM_SEQ_LEN, _LSTM_FEAT_DIM, _LSTM_LOAD_ATTEMPTED
    if _LSTM_LOAD_ATTEMPTED:
        return _LSTM_MODEL
    _LSTM_LOAD_ATTEMPTED = True
    models_dir = _Path(__file__).resolve().parent.parent.parent / "models"
    h5   = models_dir / "lstm_sign.h5"
    meta = models_dir / "lstm_labels.json"
    if not h5.exists() or not meta.exists():
        return None
    try:
        from tensorflow.keras.models import load_model
        _LSTM_MODEL = load_model(str(h5), compile=False)
        info = _json.loads(meta.read_text())
        _LSTM_LABELS   = info["labels"]
        _LSTM_SEQ_LEN  = int(info.get("seq_len", 16))
        _LSTM_FEAT_DIM = int(info.get("feat_dim", 5))
    except Exception as e:
        print(f"[sign_classifier] LSTM load failed: {e}")
        _LSTM_MODEL = None
    return _LSTM_MODEL


def classify_sequence_scored(
    frames: list[list[list[float]]],
) -> tuple[Optional[str], float]:
    """
    Classify a rolling window of landmark frames.

    Strategy:
      1. LSTM if loaded and confident (>=0.55).
      2. Majority vote across frames using the rule-based classifier.
         Confidence = fraction of frames that agree on the top sign,
         weighted by per-frame confidence.
    """
    if not frames:
        return None, 0.0

    model = _load_lstm()
    if model is not None:
        feats = []
        for frame in frames:
            if len(frame) < 21:
                continue
            pts = _normalize(frame)
            feats.append(_extensions(pts))
        if feats:
            arr = np.stack(feats).astype(np.float32)
            if len(arr) != _LSTM_SEQ_LEN:
                idx = np.linspace(0, len(arr) - 1, _LSTM_SEQ_LEN).round().astype(int)
                arr = arr[idx]
            probs = model.predict(arr[None, ...], verbose=0)[0]
            top   = int(np.argmax(probs))
            conf  = float(probs[top])
            if conf >= 0.55:
                return _LSTM_LABELS[top], conf

    # Majority vote over frames
    votes: dict[str, float] = {}
    for frame in frames:
        sign, conf = classify_sign_scored(frame)
        if sign and conf > 0:
            votes[sign] = votes.get(sign, 0.0) + conf

    if not votes:
        return None, 0.0

    best = max(votes, key=lambda k: votes[k])
    # Normalise: avg confidence of the winning sign across all frames
    avg_conf = votes[best] / len(frames)
    return best, min(avg_conf, 0.95)


def classify_sequence(
    frames: list[list[list[float]]],
    threshold: float = 0.30,
) -> Optional[str]:
    label, conf = classify_sequence_scored(frames)
    return label if conf >= threshold else None
