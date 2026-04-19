"""
Runs MediaPipe HolisticLandmarker (Tasks API, mediapipe >= 0.10) on every
video in datasets/videos/<GLOSS>/<n>.mp4 and extracts pose landmark sequences.

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
import urllib.request
from pathlib import Path

import cv2

VIDEO_DIR  = Path(__file__).parent / "videos"
POSE_DIR   = Path(__file__).parent / "poses"
MODELS_DIR = Path(__file__).parent / "models"

HOLISTIC_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "holistic_landmarker/holistic_landmarker/float16/latest/"
    "holistic_landmarker.task"
)
HOLISTIC_MODEL_PATH = MODELS_DIR / "holistic_landmarker.task"


def _download_model():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if HOLISTIC_MODEL_PATH.exists():
        return
    print(f"Downloading holistic model (~8 MB)…")
    urllib.request.urlretrieve(HOLISTIC_MODEL_URL, HOLISTIC_MODEL_PATH)
    print(f"Saved → {HOLISTIC_MODEL_PATH}")


def _lm_to_list(landmarks) -> list[list[float]]:
    if not landmarks:
        return []
    return [[lm.x, lm.y, lm.z] for lm in landmarks]


def extract_video(video_path: Path, landmarker) -> list[dict]:
    """Extract per-frame pose dicts. Returns list of frame dicts."""
    import mediapipe as mp
    from mediapipe.tasks.python.vision import RunningMode

    cap = cv2.VideoCapture(str(video_path))
    frames = []
    ts_ms = 0

    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break

        rgb    = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        result = landmarker.detect_for_video(mp_img, ts_ms)
        ts_ms += 33  # assume ~30 fps

        body = _lm_to_list(
            result.pose_landmarks[0] if result.pose_landmarks else None
        )
        rhand = _lm_to_list(
            result.right_hand_landmarks[0] if result.right_hand_landmarks else None
        )
        lhand = _lm_to_list(
            result.left_hand_landmarks[0] if result.left_hand_landmarks else None
        )

        if body:  # skip frames where pose not detected
            frames.append({"body": body, "rightHand": rhand, "leftHand": lhand})

    cap.release()
    return frames


def downsample(frames: list[dict], n: int = 6) -> list[dict]:
    if len(frames) <= n:
        return frames
    step = len(frames) / n
    return [frames[round(i * step)] for i in range(n)]


def main():
    _download_model()

    import mediapipe as mp
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision as mp_vision

    gloss_dirs = sorted(VIDEO_DIR.glob("*"))
    if not gloss_dirs:
        print(f"No videos found in {VIDEO_DIR}. Run download_isign.py first.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(gloss_dirs)} gloss directories.")

    base_opts = mp_tasks.BaseOptions(model_asset_path=str(HOLISTIC_MODEL_PATH))
    options = mp_vision.HolisticLandmarkerOptions(
        base_options=base_opts,
        running_mode=mp_vision.RunningMode.VIDEO,
        output_face_blendshapes=False,
        output_segmentation_masks=False,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    with mp_vision.HolisticLandmarker.create_from_options(options) as landmarker:
        for gloss_dir in gloss_dirs:
            gloss = gloss_dir.name
            out_dir = POSE_DIR / gloss
            out_dir.mkdir(parents=True, exist_ok=True)

            for video_path in sorted(gloss_dir.glob("*.mp4")):
                out_path = out_dir / video_path.with_suffix(".json").name
                if out_path.exists():
                    continue

                frames = extract_video(video_path, landmarker)
                if not frames:
                    print(f"  WARN: no pose detected in {video_path.name}")
                    continue

                sampled = downsample(frames, n=6)
                out_path.write_text(json.dumps(sampled))

            print(f"  {gloss}: done")

    print(f"\nPose extraction complete → {POSE_DIR}")


if __name__ == "__main__":
    main()
