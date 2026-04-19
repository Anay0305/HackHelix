"""
Downloads the ISLRTC ISL dictionary dataset from Kaggle and organises
videos into datasets/videos/<GLOSS>/<idx>.mp4 — the format that
extract_poses.py expects.

Prerequisites:
  pip install kaggle
  Set up ~/.kaggle/kaggle.json (from kaggle.com → Account → API → Create Token)

Run once, then:
  python extract_poses.py
  python build_pose_db.py
"""

import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

DATASET_SLUG = "atharvadumbre/indian-sign-language-islrtc-referred"
DOWNLOAD_DIR = Path(__file__).parent / "_kaggle_download"
OUT_DIR      = Path(__file__).parent / "videos"

# Only keep these glosses — matches BUILTIN_POSES in pose_lookup.py
GLOSS_WHITELIST: set[str] = {
    "HELLO", "ME", "YOU", "GOOD", "YES", "NO", "WANT", "HELP", "STOP",
    "UNDERSTAND", "WATER", "EAT", "SLEEP", "COME", "GO", "NAME", "WHAT",
    "THANK_YOU", "PLEASE", "KNOW", "NOT", "CAN", "WHERE", "HERE", "OKAY",
    "HOW", "WHY", "WHO", "WHEN", "HAVE", "NEED", "FEEL", "SICK", "PAIN",
    "DOCTOR", "HOSPITAL", "POLICE", "FIRE", "CALL",
}

MAX_PER_GLOSS = 5
VIDEO_EXTS    = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def _normalise_gloss(name: str) -> str:
    """Map a video filename/directory name to a gloss token."""
    name = re.sub(r"\s+", "_", name.strip().upper())
    name = re.sub(r"[^A-Z0-9_\-]", "", name)
    name = re.sub(r"_+", "_", name).strip("_")
    # Common aliases in ISLRTC naming
    aliases = {
        "THANK YOU": "THANK_YOU",
        "THANKYOU":  "THANK_YOU",
    }
    return aliases.get(name, name)


def _kaggle_available() -> bool:
    try:
        subprocess.run(["kaggle", "--version"], check=True,
                       capture_output=True, text=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def download_dataset():
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    zip_candidates = list(DOWNLOAD_DIR.glob("*.zip"))
    if zip_candidates:
        print(f"Zip already present: {zip_candidates[0].name} — skipping download.")
        return zip_candidates[0]

    if not _kaggle_available():
        print("ERROR: kaggle CLI not found. Install with:  pip install kaggle")
        print("Then add your API token to ~/.kaggle/kaggle.json")
        sys.exit(1)

    print(f"Downloading {DATASET_SLUG} from Kaggle…")
    subprocess.run(
        ["kaggle", "datasets", "download", "-d", DATASET_SLUG,
         "-p", str(DOWNLOAD_DIR)],
        check=True,
    )
    zips = list(DOWNLOAD_DIR.glob("*.zip"))
    if not zips:
        print("ERROR: no zip downloaded — check kaggle credentials.")
        sys.exit(1)
    return zips[0]


def extract_zip(zip_path: Path) -> Path:
    extract_dir = DOWNLOAD_DIR / "extracted"
    if extract_dir.exists():
        print(f"Already extracted → {extract_dir}")
        return extract_dir
    print(f"Extracting {zip_path.name}…")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract_dir)
    return extract_dir


def collect_videos(root: Path) -> dict[str, list[Path]]:
    """
    Walk the extracted directory and group video files by gloss.

    Handles two common layouts:
      1. <root>/<GLOSS>/<n>.mp4       — folder-named
      2. <root>/<GLOSS>_<n>.mp4       — file-named with underscore
      3. <root>/<GLOSS>.mp4           — single file per gloss
    """
    gloss_to_videos: dict[str, list[Path]] = {}

    for path in root.rglob("*"):
        if path.suffix.lower() not in VIDEO_EXTS:
            continue

        # Try parent directory name first (most reliable)
        parent_gloss = _normalise_gloss(path.parent.name)
        stem_gloss   = _normalise_gloss(path.stem)

        # Prefer parent-dir gloss if it looks like a real word,
        # otherwise fall back to the file stem.
        gloss = parent_gloss if (parent_gloss and parent_gloss != "EXTRACTED") else stem_gloss

        if not gloss:
            continue

        gloss_to_videos.setdefault(gloss, []).append(path)

    return gloss_to_videos


def organise_videos(gloss_to_videos: dict[str, list[Path]]):
    copied = 0
    skipped_gloss = 0
    for gloss, paths in sorted(gloss_to_videos.items()):
        if gloss not in GLOSS_WHITELIST:
            skipped_gloss += 1
            continue

        dest_dir = OUT_DIR / gloss
        dest_dir.mkdir(parents=True, exist_ok=True)

        for i, src in enumerate(paths[:MAX_PER_GLOSS]):
            dest = dest_dir / f"{i}.mp4"
            if dest.exists():
                continue
            shutil.copy2(src, dest)
            copied += 1

    print(f"\nCopied {copied} videos for {len(GLOSS_WHITELIST) - skipped_gloss} glosses → {OUT_DIR}")
    if skipped_gloss:
        print(f"Skipped {skipped_gloss} non-whitelisted glosses.")


def report_missing(gloss_to_videos: dict[str, list[Path]]):
    found = {g for g in gloss_to_videos if g in GLOSS_WHITELIST}
    missing = GLOSS_WHITELIST - found
    if missing:
        print(f"\nNot found in dataset ({len(missing)} signs — will use builtins):")
        print("  " + ", ".join(sorted(missing)))
    else:
        print(f"\nAll {len(GLOSS_WHITELIST)} whitelisted signs found in dataset.")


def main():
    zip_path   = download_dataset()
    extract_dir = extract_zip(zip_path)
    gloss_map  = collect_videos(extract_dir)

    print(f"Found {len(gloss_map)} unique glosses in dataset.")
    report_missing(gloss_map)
    organise_videos(gloss_map)

    print("\nNext steps:")
    print("  python extract_poses.py   # run MediaPipe on downloaded videos")
    print("  python build_pose_db.py   # build backend/data/pose_db.json")


if __name__ == "__main__":
    main()
