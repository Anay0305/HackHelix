"""
Builds backend/data/pose_db.json from extracted pose JSON files.

For each gloss:
  - Load all per-video pose sequences from datasets/poses/<GLOSS>/
  - Average landmark positions across all videos per frame slot
  - Downsample to ≤8 keyframes
  - Convert to {body:[{x,y,z}], rightHand:[{x,y,z}], leftHand:[{x,y,z}]} format

Run after extract_poses.py.
"""

import json
import statistics
from pathlib import Path

POSE_DIR = Path(__file__).parent / "poses"
OUT_PATH = Path(__file__).parent.parent / "backend" / "data" / "pose_db.json"
MAX_FRAMES = 8


def avg_landmarks(sequences: list[list[list[float]]]) -> list[list[float]]:
    """
    Given multiple sequences of [[x,y,z],...] (one per video),
    return the per-slot average. Sequences of different lengths are padded/trimmed.
    Returns empty list if no sequences have data.
    """
    sequences = [s for s in sequences if s]
    if not sequences:
        return []

    n = min(len(s) for s in sequences)
    result = []
    for i in range(n):
        xs = [s[i][0] for s in sequences]
        ys = [s[i][1] for s in sequences]
        zs = [s[i][2] for s in sequences]
        result.append([
            statistics.mean(xs),
            statistics.mean(ys),
            statistics.mean(zs),
        ])
    return result


def lm_list_to_dicts(coords: list[list[float]]) -> list[dict]:
    return [{"x": c[0], "y": c[1], "z": c[2]} for c in coords]


def merge_frames(video_frames: list[list[dict]]) -> list[dict]:
    """
    Merge frame sequences from multiple videos into one representative sequence.
    Each merged frame averages body/hand landmarks across videos.
    """
    if not video_frames:
        return []

    # Normalize all videos to MAX_FRAMES slots via even-step sampling
    normalized: list[list[dict]] = []
    for frames in video_frames:
        if not frames:
            continue
        n = min(len(frames), MAX_FRAMES)
        step = len(frames) / n
        normalized.append([frames[round(i * step)] for i in range(n)])

    if not normalized:
        return []

    n_frames = min(len(v) for v in normalized)
    merged = []
    for fi in range(n_frames):
        body_seqs  = [v[fi]["body"]      for v in normalized if v[fi]["body"]]
        rhand_seqs = [v[fi]["rightHand"] for v in normalized if v[fi]["rightHand"]]
        lhand_seqs = [v[fi]["leftHand"]  for v in normalized if v[fi]["leftHand"]]

        merged.append({
            "body":      lm_list_to_dicts(avg_landmarks(body_seqs)),
            "rightHand": lm_list_to_dicts(avg_landmarks(rhand_seqs)),
            "leftHand":  lm_list_to_dicts(avg_landmarks(lhand_seqs)),
        })

    return merged


def main():
    gloss_dirs = sorted(POSE_DIR.glob("*"))
    if not gloss_dirs:
        print(f"No pose data found in {POSE_DIR}. Run extract_poses.py first.")
        return

    pose_db: dict[str, list] = {}

    for gloss_dir in gloss_dirs:
        gloss = gloss_dir.name.upper()
        video_frames: list[list[dict]] = []

        for pose_file in sorted(gloss_dir.glob("*.json")):
            frames = json.loads(pose_file.read_text())
            video_frames.append(frames)

        merged = merge_frames(video_frames)
        if merged:
            pose_db[gloss] = merged
            print(f"  {gloss}: {len(merged)} keyframes from {len(video_frames)} videos")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(pose_db, indent=2))
    print(f"\nSaved {len(pose_db)} signs → {OUT_PATH}")


if __name__ == "__main__":
    main()
