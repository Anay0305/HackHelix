"""
YAMNet-based environmental sound alert detection for deaf users.

Detects: fire alarms, doorbells, car horns, sirens, phones, etc.
Uses Google's YAMNet (521-class audio classifier) from TensorFlow Hub.

Public API
----------
detect_alert_sync(pcm16_bytes, src_sr=48000, threshold=0.4) -> AlertResult | None

AlertResult = {"alertType": str, "confidence": float, "label": str}
alertType values: "fire_alarm" | "doorbell" | "horn" | "siren" | "phone" | "alarm" | "bell"
"""

import numpy as np

YAMNET_URL = "https://tfhub.dev/google/yamnet/1"

# YAMNet display_name → (alertType, min_confidence)
# Thresholds kept low (~0.1-0.25) because real-world audio off a laptop mic
# rarely pushes YAMNet above 0.4 except on very clean signals. Safety-critical
# classes (fire/siren) use slightly higher thresholds to reduce false alarms.
_ALERT_MAP: dict[str, tuple[str, float]] = {
    # Fire / smoke
    "Smoke detector, smoke alarm": ("fire_alarm", 0.20),
    "Fire alarm":                  ("fire_alarm", 0.20),
    "Alarm":                       ("alarm",      0.15),
    "Beep, bleep":                 ("alarm",      0.25),
    "Buzzer":                      ("alarm",      0.20),
    # Doorbell
    "Doorbell":                    ("doorbell",   0.15),
    "Ding-dong":                   ("doorbell",   0.20),
    "Knock":                       ("doorbell",   0.20),
    "Door":                        ("doorbell",   0.30),
    # Vehicles
    "Car horn, auto horn, motor horn, hooter": ("horn", 0.15),
    "Honk":                        ("horn",       0.20),
    "Vehicle horn, car horn, honking": ("horn",   0.15),
    "Siren":                       ("siren",      0.20),
    "Ambulance (siren)":           ("siren",      0.20),
    "Police car (siren)":          ("siren",      0.20),
    "Fire engine, fire truck (siren)": ("siren", 0.20),
    "Civil defense siren":         ("siren",      0.20),
    # Bells / phones
    "Bicycle bell":                ("bell",       0.25),
    "Bell":                        ("bell",       0.25),
    "Ring":                        ("bell",       0.25),
    "Telephone":                   ("phone",      0.20),
    "Ringtone":                    ("phone",      0.20),
    "Telephone bell ringing":      ("phone",      0.20),
    "Cellphone":                   ("phone",      0.25),
    # Voice / presence (useful for demo even if not "safety")
    "Baby cry, infant cry":        ("baby_cry",   0.20),
    "Crying, sobbing":             ("baby_cry",   0.25),
    # Handclap / knock (pay-attention signals in a home)
    "Clapping":                    ("bell",       0.30),
    "Finger snapping":             ("bell",       0.35),
    "Whistle":                     ("bell",       0.25),
    "Whistling":                   ("bell",       0.25),
}

# When DEBUG is on, the service prints the top-5 predictions on every call —
# invaluable for tuning thresholds without blind guessing.
import os as _os
_DEBUG = _os.getenv("YAMNET_DEBUG", "").lower() in ("1", "true")

# ── lazy singletons ────────────────────────────────────────────────────────

_model = None
_class_names: list[str] | None = None
_alert_indices: dict[int, tuple[str, float]] | None = None   # idx → (type, min_conf)

try:
    import tensorflow as _tf
    import tensorflow_hub as _hub
    _TF_AVAILABLE = True
except ImportError:
    _TF_AVAILABLE = False


def _load_model():
    global _model, _class_names, _alert_indices
    if _model is not None:
        return _model, _class_names, _alert_indices

    import csv
    _model = _hub.load(YAMNET_URL)

    # Load class names from the CSV embedded in the SavedModel asset
    class_map_path = _model.class_map_path().numpy().decode("utf-8")
    with open(class_map_path) as f:
        reader = csv.DictReader(f)
        _class_names = [row["display_name"] for row in reader]

    # Pre-build index lookup for alert classes
    _alert_indices = {}
    for name, (alert_type, min_conf) in _ALERT_MAP.items():
        try:
            idx = _class_names.index(name)
            _alert_indices[idx] = (alert_type, min_conf)
        except ValueError:
            pass  # class name not in this version of YAMNet

    return _model, _class_names, _alert_indices


# ── public API ─────────────────────────────────────────────────────────────

def preload() -> None:
    """Pre-warm the YAMNet model. Call once at app startup."""
    if _TF_AVAILABLE:
        _load_model()


def detect_alert_sync(
    pcm16_bytes: bytes,
    src_sr: int = 48000,
    threshold: float = 0.10,   # floor; per-class thresholds in _ALERT_MAP take precedence
) -> dict | None:
    """
    Run YAMNet on PCM16 audio and return the highest-confidence alert event.
    Returns None if no alert class exceeds its threshold.
    Needs ≥ 0.96 s of audio (YAMNet minimum window).
    Safe to call from asyncio.to_thread().
    """
    if not _TF_AVAILABLE:
        return None

    # Need at least ~1 s at 16 kHz = 16 000 samples
    min_bytes_48k = 48_000 * 2   # 1 s × 48 000 Hz × 2 bytes/sample
    if len(pcm16_bytes) < min_bytes_48k:
        return None

    try:
        model, class_names, alert_indices = _load_model()

        # Decode and resample to 16 kHz float32
        samples = np.frombuffer(pcm16_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        if src_sr != 16000:
            try:
                import librosa
                samples = librosa.resample(samples, orig_sr=src_sr, target_sr=16000)
            except ImportError:
                # Naive integer downsample as fallback
                ratio = src_sr // 16000
                samples = samples[::ratio]

        waveform = _tf.constant(samples, dtype=_tf.float32)
        scores, _, _ = model(waveform)
        # scores: (n_frames, 521) — average across time
        mean_scores = _tf.reduce_mean(scores, axis=0).numpy()

        # Debug: print top-5 predictions so thresholds can be tuned from logs.
        if _DEBUG:
            top5 = np.argsort(mean_scores)[-5:][::-1]
            parts = [f"{class_names[i]}:{mean_scores[i]:.2f}" for i in top5]
            rms = float(np.sqrt(np.mean(samples ** 2)))
            print(f"[yamnet] rms={rms:.4f} top5=[{', '.join(parts)}]")

        # Find the best matching alert class
        best: dict | None = None
        for idx, (alert_type, min_conf) in alert_indices.items():
            score = float(mean_scores[idx])
            effective = max(min_conf, threshold)
            if score >= effective:
                if best is None or score > best["confidence"]:
                    best = {
                        "alertType":  alert_type,
                        "confidence": round(score, 3),
                        "label":      class_names[idx],
                    }

        return best

    except Exception:
        return None
