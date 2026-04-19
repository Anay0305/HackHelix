"""
Downloads the iSign word-prediction subset from HuggingFace.

Run once before extract_poses.py.
Output: datasets/videos/<GLOSS>/<idx>.mp4
"""

import os
import sys
from pathlib import Path
import requests
from datasets import load_dataset

OUT_DIR = Path(__file__).parent / "videos"
MAX_PER_GLOSS = 5  # enough to pick representative frames; raise for better quality

# Only download these glosses (matches backend/src/services/pose_lookup.py BUILTIN_POSES).
# Set to None to download everything (huge — 118k videos).
GLOSS_WHITELIST: set[str] | None = {
    "HELLO", "ME", "YOU", "GOOD", "YES", "NO", "WANT", "HELP", "STOP",
    "UNDERSTAND", "WATER", "EAT", "SLEEP", "COME", "GO", "NAME", "WHAT",
    "THANK_YOU", "PLEASE", "KNOW", "NOT", "CAN", "WHERE", "HERE", "OKAY",
    "HOW", "WHY", "WHO", "WHEN", "HAVE", "NEED", "FEEL", "SICK", "PAIN",
    "DOCTOR", "HOSPITAL", "POLICE", "FIRE", "CALL",
}


def download_video(url: str, dest: Path) -> bool:
    try:
        r = requests.get(url, timeout=30, stream=True)
        r.raise_for_status()
        dest.write_bytes(r.content)
        return True
    except Exception as e:
        print(f"  WARN: {e}", file=sys.stderr)
        return False


def main():
    print("Loading iSign word-prediction split from HuggingFace...")
    # iSign is a gated dataset — run `huggingface-cli login` first, or set HF_TOKEN env var.
    # Also accept the dataset terms at: https://huggingface.co/datasets/Exploration-Lab/iSign
    try:
        ds = load_dataset("Exploration-Lab/iSign", "Word_Prediction", split="train")
    except Exception:
        ds = load_dataset("Exploration-Lab/iSign", split="train")

    print(f"Dataset columns: {ds.column_names}")
    print(f"Total samples: {len(ds)}")

    # Find the gloss / video columns (names vary by version)
    gloss_col = next((c for c in ds.column_names if c.lower() in ("gloss", "word", "label", "sign")), ds.column_names[0])
    video_col = next((c for c in ds.column_names if c.lower() in ("video", "video_path", "url", "file")), None)

    if video_col is None:
        print("ERROR: cannot find video column. Columns available:", ds.column_names)
        sys.exit(1)

    print(f"Using gloss_col={gloss_col!r}, video_col={video_col!r}")

    seen: dict[str, int] = {}
    downloaded = 0

    for sample in ds:
        gloss = str(sample[gloss_col]).upper().strip()
        if GLOSS_WHITELIST is not None and gloss not in GLOSS_WHITELIST:
            continue
        if seen.get(gloss, 0) >= MAX_PER_GLOSS:
            continue

        idx = seen.get(gloss, 0)
        dest_dir = OUT_DIR / gloss
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{idx}.mp4"

        if dest.exists():
            seen[gloss] = idx + 1
            continue

        video_val = sample[video_col]

        if isinstance(video_val, str):
            # It's a URL or path
            if video_val.startswith("http"):
                if download_video(video_val, dest):
                    seen[gloss] = idx + 1
                    downloaded += 1
            else:
                # Local path in dataset cache
                src = Path(video_val)
                if src.exists():
                    import shutil
                    shutil.copy2(src, dest)
                    seen[gloss] = idx + 1
                    downloaded += 1
        elif hasattr(video_val, "path"):
            # HuggingFace Video feature
            import shutil
            shutil.copy2(video_val.path, dest)
            seen[gloss] = idx + 1
            downloaded += 1
        elif isinstance(video_val, bytes):
            dest.write_bytes(video_val)
            seen[gloss] = idx + 1
            downloaded += 1

        if downloaded % 100 == 0 and downloaded > 0:
            print(f"  {downloaded} videos downloaded, {len(seen)} unique glosses...")

    print(f"\nDone. {downloaded} videos across {len(seen)} glosses → {OUT_DIR}")


if __name__ == "__main__":
    main()
