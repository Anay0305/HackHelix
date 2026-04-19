"""
Runs MediaPipe Holistic on every video in datasets/videos/<GLOSS>/<n>.mp4
and extracts pose landmark sequences.

Output: datasets/poses/<GLOSS>/<n>.json  — list of frames, each frame:
  {
    "body":      [[x,y,z], ...],   # 33 landmarks
    "rightHand": [[x,y,z], ...],   # 21 landmarks ([] if hand not detected)
    "leftHand":  [[x,y,z], ...]    # 21 landmarks ([] if hand not detected)
  }

Run after download_isign.py.
"""

import json
import sys
from pathlib import Path

import cv2
import mediapipe as mp

VIDEO_DIR = Path(__file__).parent / "videos"
POSE_DIR = Path(__file__).parent / "poses"

mp_holistic = mp.solutions.holistic


def lm_to_list(landmark_list):
    if landmark_list is None:
        return []
    return [[lm.x, lm.y, lm.z] for lm in landmark_list.landmark]


def extract_video(video_path: Path, holistic) -> list[dict]:
    """Extract per-frame pose dicts from a video. Returns list of frame dicts."""
    cap = cv2.VideoCapture(str(video_path))
    frames = []

    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = holistic.process(rgb)

        frames.append({
            "body":      lm_to_list(result.pose_landmarks),
            "rightHand": lm_to_list(result.right_hand_landmarks),
            "leftHand":  lm_to_list(result.left_hand_landmarks),
        })

    cap.release()
    return frames


def downsample(frames: list[dict], n: int = 6) -> list[dict]:
    """Pick n evenly-spaced frames from the sequence."""
    if len(frames) <= n:
        return frames
    step = len(frames) / n
    return [frames[round(i * step)] for i in range(n)]


def main():
    gloss_dirs = sorted(VIDEO_DIR.glob("*"))
    if not gloss_dirs:
        print(f"No videos found in {VIDEO_DIR}. Run download_isign.py first.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(gloss_dirs)} gloss directories.")

    with mp_holistic.Holistic(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        refine_face_landmarks=False,
    ) as holistic:

        for gloss_dir in gloss_dirs:
            gloss = gloss_dir.name
            out_dir = POSE_DIR / gloss
            out_dir.mkdir(parents=True, exist_ok=True)

            for video_path in sorted(gloss_dir.glob("*.mp4")):
                out_path = out_dir / video_path.with_suffix(".json").name
                if out_path.exists():
                    continue

                frames = extract_video(video_path, holistic)
                if not frames:
                    continue

                sampled = downsample(frames, n=6)
                out_path.write_text(json.dumps(sampled))

            print(f"  {gloss}: done")

    print(f"\nPose extraction complete → {POSE_DIR}")


if __name__ == "__main__":
    main()
