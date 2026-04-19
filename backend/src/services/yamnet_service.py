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
_ALERT_MAP: dict[str, tuple[str, float]] = {
    "Smoke detector, smoke alarm": ("fire_alarm", 0.40),
    "Fire alarm":                  ("fire_alarm", 0.40),
    "Alarm":                       ("alarm",      0.45),
    "Doorbell":                    ("doorbell",   0.45),
    "Ding-dong":                   ("doorbell",   0.50),
    "Car horn, auto horn, motor horn, hooter": ("horn", 0.45),
    "Honk":                        ("horn",       0.50),
    "Siren":                       ("siren",      0.40),
    "Ambulance (siren)":           ("siren",      0.40),
    "Police car (siren)":          ("siren",      0.40),
    "Fire engine, fire truck (siren)": ("siren", 0.40),
    "Civil defense siren":         ("siren",      0.40),
    "Bicycle bell":                ("bell",       0.55),
    "Bell":                        ("bell",       0.55),
    "Telephone":                   ("phone",      0.50),
    "Ringtone":                    ("phone",      0.50),
    "Telephone bell ringing":      ("phone",      0.45),
}

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

def detect_alert_sync(
    pcm16_bytes: bytes,
    src_sr: int = 48000,
    threshold: float = 0.4,
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

        # Find the best matching alert class
        best: dict | None = None
        for idx, (alert_type, min_conf) in alert_indices.items():
            score = float(mean_scores[idx])
            if score >= min_conf and score >= threshold:
                if best is None or score > best["confidence"]:
                    best = {
                        "alertType":  alert_type,
                        "confidence": round(score, 3),
                        "label":      class_names[idx],
                    }

        return best

    except Exception:
        return None
