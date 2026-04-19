#!/usr/bin/env python3
"""
Generate synthetic training sequences from BUILTIN_POSES by interpolating
keyframes and adding calibrated noise.

This gives the LSTM real training data without needing to download videos.
Each sign gets 50 synthetic sequences; each sequence is SEQ_LEN frames.

Output: datasets/poses_synthetic/<SIGN>/<idx>.json
Format: [{"rightHand": [[x,y,z]×21], "leftHand": [[x,y,z]×21]}, ...]
"""

import json
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
from src.services.pose_lookup import BUILTIN_POSES

OUT_DIR      = Path(__file__).parent / "poses_synthetic"
SEQ_LEN      = 30
N_PER_SIGN   = 50
NOISE_STD    = 0.018    # ~1.8% of normalized coords
SPEED_RANGE  = (0.7, 1.3)
DRIFT_STD    = 0.008    # slow wrist drift per sign

rng = np.random.default_rng(42)


def _lm_to_arr(lm_list: list) -> np.ndarray:
    """Convert list of {x,y,z} dicts → (N,3) float32."""
    return np.array([[d["x"], d["y"], d.get("z", 0.0)] for d in lm_list],
                    dtype=np.float32)


def _arr_to_lm(arr: np.ndarray) -> list:
    return [{"x": float(r[0]), "y": float(r[1]), "z": float(r[2])}
            for r in arr]


def build_sequence(keyframes_rh: list[np.ndarray],
                   keyframes_lh: list[np.ndarray]) -> list[dict]:
    """
    Interpolate keyframes to SEQ_LEN and add noise.

    keyframes_rh / lh: list of (21,3) arrays in keyframe order.
    Returns a list of SEQ_LEN dicts: {"rightHand": [...], "leftHand": [...]}
    """
    n = len(keyframes_rh)

    # Random speed stretch: expand/compress number of source frames
    raw_len = max(2, int(SEQ_LEN * rng.uniform(*SPEED_RANGE)))
    # Interpolate between consecutive keyframes
    frames_rh, frames_lh = [], []
    for i in range(raw_len):
        t = i / max(raw_len - 1, 1) * (n - 1)
        lo, hi = int(t), min(int(t) + 1, n - 1)
        alpha = t - lo
        rh = (1 - alpha) * keyframes_rh[lo] + alpha * keyframes_rh[hi]
        lh = (1 - alpha) * keyframes_lh[lo] + alpha * keyframes_lh[hi]
        frames_rh.append(rh)
        frames_lh.append(lh)

    # Resample to exactly SEQ_LEN
    idxs = np.linspace(0, raw_len - 1, SEQ_LEN).round().astype(int)
    frames_rh = [frames_rh[i] for i in idxs]
    frames_lh = [frames_lh[i] for i in idxs]

    # Add per-sequence global drift (simulates different signers)
    drift_rh = rng.normal(0, DRIFT_STD, size=(1, 3)).astype(np.float32)
    drift_lh = rng.normal(0, DRIFT_STD, size=(1, 3)).astype(np.float32)

    seq = []
    for rh, lh in zip(frames_rh, frames_lh):
        noise_rh = rng.normal(0, NOISE_STD, size=rh.shape).astype(np.float32)
        noise_lh = rng.normal(0, NOISE_STD, size=lh.shape).astype(np.float32)
        seq.append({
            "rightHand": _arr_to_lm(np.clip(rh + drift_rh + noise_rh, 0, 1)),
            "leftHand":  _arr_to_lm(np.clip(lh + drift_lh + noise_lh, 0, 1)),
        })
    return seq


def main():
    signs_written = 0
    seqs_total = 0

    for sign, keyframe_dicts in BUILTIN_POSES.items():
        sign_dir = OUT_DIR / sign
        sign_dir.mkdir(parents=True, exist_ok=True)

        # Extract right and left hand arrays from each keyframe
        kf_rh, kf_lh = [], []
        for frame in keyframe_dicts:
            rh = frame.get("rightHand", [])
            lh = frame.get("leftHand", [])
            if len(rh) == 21:
                kf_rh.append(_lm_to_arr(rh))
            if len(lh) == 21:
                kf_lh.append(_lm_to_arr(lh))

        # If only one hand has data, mirror it for the other
        if not kf_rh and not kf_lh:
            print(f"  [skip] {sign}: no hand data")
            continue

        if not kf_rh:
            # Use left hand mirrored as right
            kf_rh = [np.stack([
                np.array([1 - lm[0], lm[1], lm[2]]) for lm in kf
            ]) for kf in kf_lh]
        if not kf_lh:
            # Mirror right to left
            kf_lh = [np.stack([
                np.array([1 - lm[0], lm[1], lm[2]]) for lm in kf
            ]) for kf in kf_rh]

        # Ensure same number of keyframes for both hands
        min_kf = min(len(kf_rh), len(kf_lh))
        if min_kf == 0:
            print(f"  [skip] {sign}: zero keyframes")
            continue
        kf_rh = kf_rh[:min_kf]
        kf_lh = kf_lh[:min_kf]

        # Generate N_PER_SIGN sequences
        for i in range(N_PER_SIGN):
            seq = build_sequence(kf_rh, kf_lh)
            (sign_dir / f"seq_{i:03d}.json").write_text(json.dumps(seq, separators=(',', ':')))
            seqs_total += 1

        print(f"  {sign:<16} {min_kf} keyframes -> {N_PER_SIGN} sequences")
        signs_written += 1

    print(f"\n[generate] Done: {signs_written} signs, {seqs_total} sequences -> {OUT_DIR}")
    print("[generate] Next: python train_lstm.py")


if __name__ == "__main__":
    main()
