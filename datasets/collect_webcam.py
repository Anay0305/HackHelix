#!/usr/bin/env python3
"""
Collect ISL sign training data from webcam.

Usage:
    python collect_webcam.py --sign HELLO --count 50
    python collect_webcam.py --sign ME    --count 50
    python collect_webcam.py --sign WATER --count 50

Controls (in the OpenCV window):
    SPACE — start recording a 2-second sequence
    R     — redo last sequence (deletes it)
    Q     — quit

Each sequence = 30 frames at 15 fps (~2 seconds of signing).
Saves to: datasets/poses/<SIGN>/webcam_<n>.json

Format matches extract_poses.py output so train_lstm.py works on both.
"""

import argparse
import json
import time
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

POSES_DIR   = Path(__file__).parent / "poses"
MODEL_PATH  = Path(__file__).parent / "hand_landmarker.task"
MODEL_URL   = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

SEQ_LEN     = 30
CAPTURE_FPS = 15
FRAME_MS    = 1000 / CAPTURE_FPS


def ensure_model():
    if not MODEL_PATH.exists():
        print(f"[collect] Downloading hand landmarker model (~8 MB) ...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print(f"[collect] Saved to {MODEL_PATH}")


def make_landmarker() -> mp_vision.HandLandmarker:
    opts = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(MODEL_PATH)),
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return mp_vision.HandLandmarker.create_from_options(opts)


def lm_to_list(landmarks) -> list[list[float]]:
    return [[lm.x, lm.y, lm.z] for lm in landmarks]


def draw_hand(frame, landmarks_px):
    """Draw connections between hand landmarks (pixel coords)."""
    connections = [
        (0,1),(1,2),(2,3),(3,4),          # thumb
        (0,5),(5,6),(6,7),(7,8),          # index
        (0,9),(9,10),(10,11),(11,12),     # middle
        (0,13),(13,14),(14,15),(15,16),   # ring
        (0,17),(17,18),(18,19),(19,20),   # pinky
        (5,9),(9,13),(13,17),             # palm
    ]
    for a, b in connections:
        cv2.line(frame, landmarks_px[a], landmarks_px[b], (0, 200, 80), 2)
    for pt in landmarks_px:
        cv2.circle(frame, pt, 4, (255, 255, 255), -1)


def draw_ui(frame, sign, recorded, total, state, buf_len, last_action):
    h, w = frame.shape[:2]

    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 100), (0, 0, 0), -1)
    frame = cv2.addWeighted(overlay, 0.5, frame, 0.5, 0)

    cv2.putText(frame, f"Sign: {sign}", (12, 32),
                cv2.FONT_HERSHEY_DUPLEX, 0.9, (255, 255, 255), 2)
    cv2.putText(frame, f"Recorded: {recorded}/{total}",
                (12, 62), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (200, 200, 200), 1)
    cv2.putText(frame, "SPACE=record  R=redo  Q=quit",
                (12, 88), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (150, 150, 150), 1)

    if state == "recording":
        pct   = buf_len / SEQ_LEN
        bar_w = int(pct * (w - 40))
        cv2.rectangle(frame, (20, h - 30), (w - 20, h - 10), (50, 50, 50), -1)
        cv2.rectangle(frame, (20, h - 30), (20 + bar_w, h - 10), (0, 200, 80), -1)
        cv2.putText(frame, f"RECORDING  {buf_len}/{SEQ_LEN}",
                    (12, h - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 80, 255), 2)
    elif state == "ready":
        cv2.putText(frame, "SPACE to start recording",
                    (12, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (0, 220, 120), 1)
    elif state == "done":
        cv2.putText(frame, f"Saved! {last_action}",
                    (12, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 200, 80), 2)
    elif state == "redo":
        cv2.putText(frame, "Deleted last sequence",
                    (12, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 100, 255), 2)

    return frame


def parse_args():
    p = argparse.ArgumentParser(description="Collect ISL webcam training data")
    p.add_argument("--sign",  required=True,  help="Sign label e.g. HELLO, ME, WATER")
    p.add_argument("--count", type=int, default=50, help="Sequences to record (default 50)")
    p.add_argument("--cam",   type=int, default=0,  help="Camera device index (default 0)")
    return p.parse_args()


def main():
    ensure_model()

    args    = parse_args()
    sign    = args.sign.strip().upper()
    out_dir = POSES_DIR / sign
    out_dir.mkdir(parents=True, exist_ok=True)

    existing = sorted(out_dir.glob("webcam_*.json"))
    seq_idx  = int(existing[-1].stem.split("_")[-1]) + 1 if existing else 0
    print(f"[collect] Sign: {sign}  |  existing: {len(existing)}  |  target: {args.count} new")

    cap = cv2.VideoCapture(args.cam)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    landmarker  = make_landmarker()
    recorded    = 0
    state       = "ready"
    buf: list   = []
    last_ts     = 0.0
    last_action = ""

    while recorded < args.count:
        ok, frame = cap.read()
        if not ok:
            break

        frame = cv2.flip(frame, 1)
        h, w  = frame.shape[:2]
        rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(mp_img)

        rh_lms, lh_lms = [], []

        if result.hand_landmarks and result.handedness:
            for lm_set, hd_list in zip(result.hand_landmarks, result.handedness):
                label = hd_list[0].category_name  # "Left" or "Right"
                coords = lm_to_list(lm_set)

                # Draw
                px = [(int(lm.x * w), int(lm.y * h)) for lm in lm_set]
                draw_hand(frame, px)

                if label == "Right":
                    rh_lms = coords
                else:
                    lh_lms = coords

        # Capture frame into buffer at CAPTURE_FPS
        now = time.perf_counter() * 1000
        if state == "recording" and (now - last_ts) >= FRAME_MS:
            last_ts = now
            buf.append({
                "body":      [],
                "rightHand": rh_lms,
                "leftHand":  lh_lms,
            })
            if len(buf) >= SEQ_LEN:
                out_path = out_dir / f"webcam_{seq_idx}.json"
                out_path.write_text(json.dumps(buf))
                last_action = out_path.name
                print(f"  [{recorded + 1}/{args.count}] Saved {out_path.name}")
                seq_idx  += 1
                recorded += 1
                buf       = []
                state     = "done"

        frame = draw_ui(frame, sign, recorded, args.count, state, len(buf), last_action)
        cv2.imshow(f"ISL Collector — {sign}", frame)

        key = cv2.waitKey(10) & 0xFF
        if key in (ord("q"), ord("Q"), 27):
            break
        elif key == ord(" "):
            if state != "recording":
                buf     = []
                last_ts = time.perf_counter() * 1000
                state   = "recording"
        elif key in (ord("r"), ord("R")):
            if seq_idx > 0:
                prev_path = out_dir / f"webcam_{seq_idx - 1}.json"
                if prev_path.exists():
                    prev_path.unlink()
                    seq_idx  -= 1
                    recorded  = max(0, recorded - 1)
                    state     = "redo"
                    print(f"  Deleted {prev_path.name}")
        elif state == "done":
            state = "ready"

    cap.release()
    landmarker.close()
    cv2.destroyAllWindows()

    print(f"\n[collect] Done. Recorded {recorded} new sequences for {sign}.")
    print(f"  Saved to: {out_dir}")
    print(f"\nRun training when you have enough data:")
    print(f"  python train_lstm.py")


if __name__ == "__main__":
    main()
