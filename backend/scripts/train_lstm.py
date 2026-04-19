"""
Train a small LSTM sign classifier on synthetic landmark sequences.

Why synthetic:
  Real INCLUDE / iSign require external auth/download. Until those are wired,
  we generate training data by perturbing the feature templates in
  sign_classifier.py — each template becomes ~200 noisy 16-frame sequences
  with smooth temporal trajectories. The resulting .h5 genuinely learns the
  template manifold (not a no-op) and matches the 20 ISL labels the rest
  of the pipeline already uses.

Output: backend/models/lstm_sign.h5  +  backend/models/lstm_labels.json
"""

import json
import os
from pathlib import Path
import sys

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "-1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.services.sign_classifier import SIGN_TEMPLATES, _extract_features

SEQ_LEN = 16
PER_CLASS = 200
NOISE_STD = 0.05
OUT_DIR = ROOT / "models"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def _synth_sequence(template_feats: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Produce a smooth 16-step trajectory ending at the template (with noise)."""
    start = rng.normal(0.0, 0.3, size=template_feats.shape).astype(np.float32)
    traj = np.linspace(start, template_feats, SEQ_LEN, axis=0)
    traj += rng.normal(0.0, NOISE_STD, size=traj.shape).astype(np.float32)
    norms = np.linalg.norm(traj, axis=1, keepdims=True)
    norms[norms < 1e-6] = 1.0
    return traj / norms


def build_dataset():
    # Many glosses share the exact same template (placeholder fallbacks like
    # OPEN_HAND / POINT). Training N labels on identical features just teaches
    # the model to spread probability mass across duplicates -> low confidence.
    # Dedupe first; store the full label->canonical map in lstm_labels.json so
    # the runtime can resolve any gloss back to a predicted canonical label.
    canonical: dict[tuple, str] = {}
    aliases: dict[str, str] = {}
    for lbl in sorted(SIGN_TEMPLATES.keys()):
        key = tuple(np.round(SIGN_TEMPLATES[lbl], 4))
        if key not in canonical:
            canonical[key] = lbl
        aliases[lbl] = canonical[key]

    labels = sorted(set(canonical.values()))
    label_to_idx = {lbl: i for i, lbl in enumerate(labels)}
    rng = np.random.default_rng(42)

    X: list[np.ndarray] = []
    y: list[int] = []
    for lbl in labels:
        tmpl = SIGN_TEMPLATES[lbl]
        for _ in range(PER_CLASS):
            seq = _synth_sequence(tmpl, rng)
            X.append(seq)
            y.append(label_to_idx[lbl])

    X_arr = np.stack(X).astype(np.float32)
    y_arr = np.array(y, dtype=np.int64)
    print(f"  unique templates: {len(labels)}  (from {len(SIGN_TEMPLATES)} glosses, {len(aliases)-len(labels)} aliases)")
    return X_arr, y_arr, labels, aliases


def main():
    print("Generating synthetic sequences…")
    X, y, labels, aliases = build_dataset()
    print(f"  X: {X.shape}  y: {y.shape}  classes: {len(labels)}")

    idx = np.random.default_rng(0).permutation(len(X))
    X, y = X[idx], y[idx]
    split = int(0.85 * len(X))
    X_tr, X_val = X[:split], X[split:]
    y_tr, y_val = y[:split], y[split:]

    import tensorflow as tf
    from tensorflow.keras import layers, models

    n_classes = len(labels)
    feat_dim = X.shape[-1]

    model = models.Sequential([
        layers.Input(shape=(SEQ_LEN, feat_dim)),
        layers.Masking(mask_value=0.0),
        layers.Bidirectional(layers.LSTM(64, return_sequences=True)),
        layers.Dropout(0.3),
        layers.Bidirectional(layers.LSTM(32)),
        layers.Dropout(0.3),
        layers.Dense(64, activation="relu"),
        layers.Dense(n_classes, activation="softmax"),
    ])
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.summary()

    model.fit(
        X_tr, y_tr,
        validation_data=(X_val, y_val),
        epochs=30,
        batch_size=64,
        verbose=2,
    )

    h5_path = OUT_DIR / "lstm_sign.h5"
    model.save(h5_path)
    (OUT_DIR / "lstm_labels.json").write_text(json.dumps({
        "labels": labels,
        "aliases": aliases,
        "seq_len": SEQ_LEN,
        "feat_dim": feat_dim,
    }, indent=2))
    print(f"\nSaved {h5_path}  ({len(labels)} classes, seq_len={SEQ_LEN}, feat_dim={feat_dim})")


if __name__ == "__main__":
    main()
