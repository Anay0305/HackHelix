#!/usr/bin/env python3
"""
Download the INCLUDE-50 subset from ai4bharat/INCLUDE on HuggingFace.

Usage:
    python download_include.py [--max-per-class 15] [--out-dir include_videos]

The INCLUDE dataset stores videos on Zenodo. This script:
  1. Streams metadata from HuggingFace (no large download)
  2. Filters to include_50 == True  →  ~50 sign classes
  3. Downloads up to --max-per-class videos per sign from the Zenodo URL
  4. Saves: datasets/include_videos/<SIGN>/<video_id>.mp4

Estimated size: ~15 videos × 50 signs × ~5 MB avg = ~3-5 GB
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE_DIR = Path(__file__).parent


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--max-per-class", type=int, default=15)
    p.add_argument("--out-dir", default=str(BASE_DIR / "include_videos"))
    p.add_argument("--workers", type=int, default=4)
    return p.parse_args()


def load_metadata(max_per_class: int) -> dict[str, list[dict]]:
    """Stream INCLUDE-50 metadata from HuggingFace."""
    try:
        from datasets import load_dataset  # type: ignore
    except ImportError:
        print("[error] Run: pip install datasets huggingface_hub")
        raise

    print("[include] Loading INCLUDE metadata from HuggingFace (streaming)...")
    ds = load_dataset(
        "ai4bharat/INCLUDE",
        split="train",
        streaming=True,
        trust_remote_code=True,
    )

    by_sign: dict[str, list[dict]] = {}
    count = 0
    for row in ds:
        if not row.get("include_50", False):
            continue
        sign = (row.get("sign") or row.get("label") or "UNKNOWN").upper().replace(" ", "_")
        if sign not in by_sign:
            by_sign[sign] = []
        if len(by_sign[sign]) < max_per_class:
            by_sign[sign].append(row)
            count += 1
        # Stop early if all classes have enough
        if all(len(v) >= max_per_class for v in by_sign.values()) and len(by_sign) >= 50:
            break

    print(f"[include] Collected metadata: {len(by_sign)} signs, {count} total rows")
    return by_sign


def download_video(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 10_000:
        return True
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, str(dest))
        return True
    except Exception as e:
        print(f"  [warn] {dest.name}: {e}")
        return False


def main():
    args = parse_args()
    out_dir = Path(args.out_dir)

    by_sign = load_metadata(args.max_per_class)

    # Save catalog for later use by extract_include_poses.py
    catalog_path = BASE_DIR / "include_catalog.json"
    catalog = {sign: [r.get("video_id") or r.get("id") for r in rows]
               for sign, rows in by_sign.items()}
    catalog_path.write_text(json.dumps(catalog, indent=2))
    print(f"[include] Catalog saved to {catalog_path}")

    # Collect download tasks
    tasks = []
    for sign, rows in by_sign.items():
        sign_dir = out_dir / sign
        for row in rows:
            url = row.get("video_url") or row.get("url") or row.get("file_url")
            vid_id = row.get("video_id") or row.get("id") or str(len(tasks))
            if not url:
                # Try to construct Zenodo URL from known pattern
                url = f"https://zenodo.org/record/4010759/files/{vid_id}.mp4"
            ext = ".mp4" if ".mp4" in url else ".mov"
            dest = sign_dir / f"{vid_id}{ext}"
            tasks.append((url, dest, sign))

    print(f"[include] Downloading {len(tasks)} videos with {args.workers} workers...")
    ok = fail = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(download_video, url, dest): sign
                for url, dest, sign in tasks}
        for i, fut in enumerate(as_completed(futs), 1):
            if fut.result():
                ok += 1
            else:
                fail += 1
            if i % 50 == 0:
                elapsed = time.time() - t0
                print(f"  {i}/{len(tasks)} done  ({ok} ok, {fail} fail)  "
                      f"{elapsed:.0f}s elapsed")

    print(f"\n[include] Done: {ok} downloaded, {fail} failed → {out_dir}")
    print("[include] Next step: python extract_include_poses.py")


if __name__ == "__main__":
    main()
