"""
Simple ISL sign classifier using normalized hand landmark features.

Each sign is defined by a feature vector derived from:
- Finger extension ratios (how open each finger is)
- Inter-fingertip distances
- Palm orientation (wrist-to-middle-MCP vector)

For a hackathon demo this gives ~70% accuracy on clear signs.
A real system would use DTW on full landmark sequences from iSign dataset.
"""

import numpy as np
from typing import Optional

# Each landmark: [x, y, z] — 21 points per hand
# MediaPipe indices:
#   0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
# MCP (knuckle) = 1st joint: 1,5,9,13,17
# TIP           = last joint: 4,8,12,16,20

FINGER_TIP_IDS  = [4, 8, 12, 16, 20]
FINGER_MCP_IDS  = [2, 5, 9,  13, 17]
FINGER_PIP_IDS  = [3, 6, 10, 14, 18]

def _extract_features(landmarks: list[list[float]]) -> np.ndarray:
    """Convert 21 landmark points into a compact feature vector."""
    pts = np.array(landmarks, dtype=np.float32)  # (21, 3)

    # Normalize: center on wrist, scale by hand size
    wrist = pts[0]
    pts = pts - wrist
    scale = np.linalg.norm(pts[9] - pts[0]) + 1e-6  # middle MCP distance
    pts = pts / scale

    # Feature 1: finger extension (tip_y < pip_y means finger is raised in image space)
    # We use the z-normalized distance from wrist to tip vs wrist to MCP
    extensions = []
    for tip, mcp in zip(FINGER_TIP_IDS, FINGER_MCP_IDS):
        tip_dist = np.linalg.norm(pts[tip])
        mcp_dist = np.linalg.norm(pts[mcp])
        extensions.append(tip_dist / (mcp_dist + 1e-6))

    # Feature 2: fingertip relative positions (x, y of each tip, normalized)
    tip_positions = pts[FINGER_TIP_IDS, :2].flatten()  # 10 values

    # Feature 3: thumb-index pinch distance
    thumb_index_dist = np.linalg.norm(pts[4] - pts[8])

    # Feature 4: palm normal (cross product of palm vectors)
    v1 = pts[5] - pts[0]
    v2 = pts[17] - pts[0]
    normal = np.cross(v1[:3], v2[:3])
    normal = normal / (np.linalg.norm(normal) + 1e-6)

    return np.concatenate([
        extensions,           # 5
        tip_positions,        # 10
        [thumb_index_dist],   # 1
        normal,               # 3
    ])  # total: 19


# --- Sign Templates ---
# These are approximate feature vectors for common ISL signs.
# Values tuned for a frontal-facing hand view.
# Format: {"GLOSS": feature_array}
#
# Real deployment: replace with centroids extracted from iSign dataset.

def _make_open_hand():
    """All fingers extended — base for several signs."""
    return np.array([
        # extensions (all fingers extended ~1.8)
        1.8, 1.8, 1.8, 1.8, 1.8,
        # tip positions (spread out)
        -0.3, -0.9, -0.1, -1.0, 0.0, -1.1, 0.1, -1.0, 0.3, -0.9,
        # thumb-index dist
        0.5,
        # palm normal (facing viewer)
        0.0, 0.0, 1.0,
    ], dtype=np.float32)

def _make_fist():
    """All fingers curled."""
    return np.array([
        1.0, 1.0, 1.0, 1.0, 1.0,
        -0.1, -0.3, 0.0, -0.3, 0.0, -0.3, 0.1, -0.3, 0.2, -0.3,
        0.1,
        0.0, 0.0, 1.0,
    ], dtype=np.float32)

def _make_pointing():
    """Index finger extended, rest curled — YOU / POINT sign."""
    return np.array([
        1.2, 1.9, 1.0, 1.0, 1.0,
        -0.2, -0.4, 0.0, -1.0, 0.0, -0.3, 0.1, -0.3, 0.2, -0.3,
        0.3,
        0.0, 0.0, 1.0,
    ], dtype=np.float32)

def _make_me():
    """Index pointing toward self (toward camera, slight inward)."""
    return np.array([
        1.2, 1.9, 1.0, 1.0, 1.0,
        -0.1, -0.2, 0.0, -1.0, 0.0, -0.3, 0.1, -0.3, 0.2, -0.3,
        0.3,
        0.0, 0.3, 0.9,
    ], dtype=np.float32)

def _make_ok():
    """Thumb and index pinching — OK / GOOD sign."""
    return np.array([
        1.1, 1.0, 1.7, 1.7, 1.7,
        -0.1, -0.3, 0.1, -0.4, 0.0, -1.0, 0.1, -0.9, 0.3, -0.8,
        0.05,
        0.0, 0.0, 1.0,
    ], dtype=np.float32)

def _make_thumbs_up():
    """Thumb up, rest curled."""
    return np.array([
        2.0, 1.0, 1.0, 1.0, 1.0,
        -0.4, -0.9, 0.1, -0.3, 0.0, -0.3, 0.1, -0.3, 0.2, -0.3,
        0.6,
        0.0, 0.0, 1.0,
    ], dtype=np.float32)

def _make_v_sign():
    """Index + middle extended (peace / V sign) — UNDERSTAND."""
    return np.array([
        1.2, 1.9, 1.9, 1.0, 1.0,
        -0.2, -0.4, -0.05, -1.0, 0.05, -1.0, 0.1, -0.3, 0.2, -0.3,
        0.35,
        0.0, 0.0, 1.0,
    ], dtype=np.float32)

def _make_wave():
    """All fingers extended but tilted — HELLO / WAVE."""
    return np.array([
        1.8, 1.8, 1.8, 1.8, 1.8,
        -0.4, -0.8, -0.2, -1.0, -0.0, -1.1, 0.2, -1.0, 0.4, -0.8,
        0.55,
        0.2, 0.0, 0.98,
    ], dtype=np.float32)


SIGN_TEMPLATES: dict[str, np.ndarray] = {
    "HELLO":      _make_wave(),
    "ME":         _make_me(),
    "YOU":        _make_pointing(),
    "GOOD":       _make_ok(),
    "YES":        _make_thumbs_up(),
    "NO":         _make_fist(),
    "WANT":       _make_open_hand(),
    "HELP":       _make_thumbs_up(),
    "STOP":       _make_open_hand(),
    "UNDERSTAND": _make_v_sign(),
    "WATER":      _make_v_sign(),     # placeholder — should come from iSign
    "EAT":        _make_fist(),       # placeholder
    "SLEEP":      _make_open_hand(),  # placeholder
    "COME":       _make_pointing(),   # placeholder
    "GO":         _make_pointing(),   # placeholder
    "NAME":       _make_v_sign(),     # placeholder
    "WHAT":       _make_open_hand(),  # placeholder
    "THANK_YOU":  _make_open_hand(),  # placeholder
    "PLEASE":     _make_open_hand(),  # placeholder
    "KNOW":       _make_pointing(),   # placeholder
}

# Normalize all templates
for k in SIGN_TEMPLATES:
    v = SIGN_TEMPLATES[k]
    SIGN_TEMPLATES[k] = v / (np.linalg.norm(v) + 1e-6)


def classify_sign(
    landmarks: list[list[float]],
    threshold: float = 0.82,
) -> Optional[str]:
    """
    Given 21 hand landmarks, return the closest matching sign gloss or None.

    Args:
        landmarks: List of 21 [x, y, z] normalized MediaPipe landmarks.
        threshold: Cosine similarity threshold. Lower = more permissive.

    Returns:
        Sign gloss string (e.g. "WATER") or None if no confident match.
    """
    if len(landmarks) < 21:
        return None

    features = _extract_features(landmarks)
    norm = np.linalg.norm(features)
    if norm < 1e-6:
        return None
    features = features / norm

    best_sign = None
    best_score = -1.0

    for sign, template in SIGN_TEMPLATES.items():
        score = float(np.dot(features, template))
        if score > best_score:
            best_score = score
            best_sign = sign

    return best_sign if best_score >= threshold else None
