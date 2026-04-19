#!/usr/bin/env python3
"""
Extract MediaPipe Hand landmarks from INCLUDE videos.

Usage:
    python extract_include_poses.py [--in-dir include_videos] [--out-dir poses_include]

For each video in include_videos/<SIGN>/<video_id>.mp4:
  1. Run MediaPipe Hands on every 3rd frame (to get ~10-20 keyframes per video)
  2. Extract 21-landmark hand arrays (right + left)
  3. Write: poses_include/<SIGN>/<video_id>.json
     Format: [{"rightHand": [[x,y,z]×21], "leftHand": [[x,y,z]×21]}, ...]

Output is compatible with train_lstm.py's extract_features() function.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

BASE_DIR = Path(__file__).parent


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--in-dir", default=str(BASE_DIR / "include_videos"))
    p.add_argument("--out-dir", default=str(BASE_DIR / "poses_include"))
    p.add_argument("--frame-skip", type=int, default=3, help="Process every Nth frame")
    return p.parse_args()


def extract_video(video_path: Path, out_path: Path, frame_skip: int, hands) -> bool:
    """Extract hand landmarks from a video, write JSON."""
    if out_path.exists():
        return True

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return False

    frames = []
    idx = 0
    while True:
        ret, img = cap.read()
        if not ret:
            break
        if idx % frame_skip != 0:
            idx += 1
            continue
        idx += 1

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        result = hands.process(rgb)

        rh = []
        lh = []
        if result.multi_hand_landmarks and result.multi_handedness:
            for hand_lms, hand_info in zip(result.multi_hand_landmarks, result.multi_handedness):
                label = hand_info.classification[0].label  # "Left" or "Right"
                lms = [[lm.x, lm.y, lm.z] for lm in hand_lms.landmark]
                if label == "Right":
                    rh = lms
                else:
                    lh = lms

        # Only keep frames where at least one hand is visible
        if rh or lh:
            frames.append({"rightHand": rh, "leftHand": lh})

    cap.release()

    if len(frames) < 5:
        return False

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(frames, indent=1))
    return True


def main():
    args = parse_args()
    in_dir = Path(args.in_dir)
    out_dir = Path(args.out_dir)

    if not in_dir.exists():
        print(f"[error] {in_dir} not found. Run download_include.py first.")
        return

    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    video_files = list(in_dir.rglob("*.mp4")) + list(in_dir.rglob("*.mov"))
    print(f"[extract] Found {len(video_files)} videos in {in_dir}")

    ok = fail = 0
    for i, vpath in enumerate(video_files, 1):
        sign = vpath.parent.name
        vid_id = vpath.stem
        out_path = out_dir / sign / f"{vid_id}.json"

        if extract_video(vpath, out_path, args.frame_skip, hands):
            ok += 1
        else:
            fail += 1

        if i % 10 == 0:
            print(f"  {i}/{len(video_files)} processed  ({ok} ok, {fail} fail)")

    hands.close()
    print(f"\n[extract] Done: {ok} extracted, {fail} failed → {out_dir}")
    print("[extract] Next step: python train_lstm.py")


if __name__ == "__main__":
    main()
