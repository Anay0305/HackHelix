#!/usr/bin/env python3
"""
Train an LSTM sign classifier on sequences in datasets/poses/.

Usage:
    python train_lstm.py [--epochs 60] [--seq-len 30] [--val-split 0.2]

Input:  datasets/poses/<SIGN>/*.json
        Each file: list of 30 dicts with "rightHand" key
        (array of 21 [x, y, z] landmark coordinates)

Output: backend/models/lstm_sign.h5
        backend/models/lstm_labels.json  (labels + metadata)

Feature extraction:
    21 hand landmarks × 3 (x, y, z) = 63-dim per frame
    Normalised: subtract wrist, divide by wrist→middle-MCP distance
    Uses dominant hand (right preferred, else left)
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

POSES_DIR  = Path(__file__).parent / "poses"
MODELS_DIR = Path(__file__).parent.parent / "backend" / "models"
SEQ_LEN    = 30   # frames per sequence (matches collect_webcam.py)
FEAT_DIM   = 63   # 21 landmarks × 3


# ── Feature extraction ────────────────────────────────────────────────────────

def _normalize(landmarks: list) -> np.ndarray:
    """
    21 landmarks → 63-dim normalised vector.
    Zero-centres on wrist; scales by wrist→middle-MCP distance.
    """
    pts = np.array(landmarks, dtype=np.float32)   # (21, 3)
    wrist = pts[0].copy()
    pts -= wrist
    scale = float(np.linalg.norm(pts[9])) + 1e-6  # middle-MCP is index 9
    pts /= scale
    return pts.flatten()   # (63,)


def extract_features(seq: list) -> np.ndarray | None:
    """
    seq: list of frame dicts, each with "rightHand" and/or "leftHand".
    Returns (SEQ_LEN, 63) float32 array or None if no hand data.
    """
    frames = []
    for frame in seq:
        rh = frame.get("rightHand") or []
        lh = frame.get("leftHand")  or []
        lms = rh if len(rh) == 21 else (lh if len(lh) == 21 else None)
        if lms is None:
            # Pad with zeros so we don't skip the sequence outright
            frames.append(np.zeros(FEAT_DIM, dtype=np.float32))
        else:
            frames.append(_normalize(lms))

    if not any(f.any() for f in frames):
        return None   # completely empty — skip

    arr = np.stack(frames).astype(np.float32)   # (n, 63)

    # Resample to SEQ_LEN via linear interpolation
    if len(arr) != SEQ_LEN:
        idxs = np.linspace(0, len(arr) - 1, SEQ_LEN).round().astype(int)
        arr  = arr[idxs]

    return arr   # (SEQ_LEN, 63)


# ── Dataset loading ───────────────────────────────────────────────────────────

def load_dataset(min_samples: int = 3):
    X, y_raw = [], []
    signs = sorted([d.name for d in POSES_DIR.iterdir() if d.is_dir()])

    if not signs:
        print(f"[train] No sign folders found in {POSES_DIR}")
        sys.exit(1)

    print(f"[train] Found {len(signs)} signs: {', '.join(signs)}")

    kept_signs = []
    for sign in signs:
        sign_dir = POSES_DIR / sign
        files = sorted(sign_dir.glob("*.json"))
        seqs  = []
        for f in files:
            try:
                seq = json.loads(f.read_text())
                if not isinstance(seq, list) or len(seq) < 5:
                    continue
                feat = extract_features(seq)
                if feat is not None:
                    seqs.append(feat)
            except Exception as e:
                print(f"  [warn] {f.name}: {e}")

        print(f"  {sign:<16} {len(seqs):>4} sequences  ({len(files)} files)")

        if len(seqs) < min_samples:
            print(f"  [skip] {sign}: only {len(seqs)} valid sequences (need {min_samples})")
            continue

        for feat in seqs:
            X.append(feat)
            y_raw.append(sign)
        kept_signs.append(sign)

    if not kept_signs:
        print("[train] No sign has enough samples. Record more data first.")
        sys.exit(1)

    return np.array(X, dtype=np.float32), y_raw, kept_signs


# ── Model ─────────────────────────────────────────────────────────────────────

def build_model(n_classes: int, seq_len: int, feat_dim: int):
    from tensorflow import keras
    from tensorflow.keras import layers

    inp = keras.Input(shape=(seq_len, feat_dim))
    x   = layers.LSTM(64, return_sequences=True)(inp)
    x   = layers.Dropout(0.3)(x)
    x   = layers.LSTM(128, return_sequences=True)(x)
    x   = layers.Dropout(0.3)(x)
    x   = layers.LSTM(64)(x)
    x   = layers.Dropout(0.3)(x)
    x   = layers.Dense(64, activation="relu")(x)
    out = layers.Dense(n_classes, activation="softmax")(x)

    model = keras.Model(inp, out)
    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


# ── Training ──────────────────────────────────────────────────────────────────

def train(epochs: int, val_split: float):
    print(f"\n[train] Loading dataset from {POSES_DIR} ...")
    X, y_raw, labels = load_dataset()

    label_map = {s: i for i, s in enumerate(labels)}
    y = np.array([label_map[s] for s in y_raw], dtype=np.int32)

    print(f"\n[train] Dataset: {len(X)} samples × {len(labels)} classes")
    print(f"        Shape: X={X.shape}  y={y.shape}")

    from sklearn.model_selection import train_test_split
    X_tr, X_val, y_tr, y_val = train_test_split(
        X, y, test_size=val_split, random_state=42, stratify=y
    )
    print(f"        Train: {len(X_tr)}  Val: {len(X_val)}")

    print(f"\n[train] Building model (LSTM 64→128→64, Dense 64→{len(labels)}) ...")
    model = build_model(len(labels), SEQ_LEN, FEAT_DIM)
    model.summary()

    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
    callbacks = [
        EarlyStopping(monitor="val_accuracy", patience=12, restore_best_weights=True, verbose=1),
        ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=6, verbose=1),
    ]

    print(f"\n[train] Training for up to {epochs} epochs ...")
    model.fit(
        X_tr, y_tr,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=32,
        callbacks=callbacks,
        verbose=1,
    )

    val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
    print(f"\n[train] Final val accuracy: {val_acc:.4f}  loss: {val_loss:.4f}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    h5_path   = MODELS_DIR / "lstm_sign.h5"
    meta_path = MODELS_DIR / "lstm_labels.json"

    model.save(str(h5_path))
    meta_path.write_text(json.dumps({
        "labels":   labels,
        "seq_len":  SEQ_LEN,
        "feat_dim": FEAT_DIM,
        "val_acc":  round(val_acc, 4),
    }, indent=2))

    print(f"\n[train] Saved model  → {h5_path}")
    print(f"[train] Saved labels → {meta_path}")
    print(f"\nLabels ({len(labels)}): {labels}")
    print("\nNext step:")
    print("  cd .. && uvicorn backend.src.main:app --reload --port 8000")


# ── Entry point ───────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Train ISL LSTM classifier")
    p.add_argument("--epochs",    type=int,   default=60,  help="Max training epochs")
    p.add_argument("--seq-len",   type=int,   default=SEQ_LEN, help="Frames per sequence")
    p.add_argument("--val-split", type=float, default=0.2, help="Validation fraction")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train(args.epochs, args.val_split)
