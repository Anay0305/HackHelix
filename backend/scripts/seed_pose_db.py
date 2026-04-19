"""Dump BUILTIN_POSES to backend/data/pose_db.json so the runtime lookup path is used."""

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.services.pose_lookup import BUILTIN_POSES

OUT = ROOT / "data" / "pose_db.json"
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(BUILTIN_POSES, indent=2))
print(f"Wrote {len(BUILTIN_POSES)} signs to {OUT}")
