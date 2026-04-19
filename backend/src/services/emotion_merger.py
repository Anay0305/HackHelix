"""
Emotion detection from audio (+ optional webcam frame).

Audio path  : SpeechBrain wav2vec2-IEMOCAP → 4-class label (neu/hap/ang/sad)
Energy path : librosa RMS → intensity [0, 1]
Face path   : DeepFace → dominant facial emotion (optional, only when image supplied)

Public API
----------
analyze_audio_sync(pcm16_bytes, src_sr=48000) -> EmotionResult
analyze_face_sync(jpeg_bytes)                 -> {"emotion": str}
merge_emotion(audio_result, face_result)      -> EmotionResult

EmotionResult = {"emotion": str, "intensity": float, "morphTargets": dict}
morphTargets keys match avatar blend shapes used in simulator.py:
  brow_raise, brow_lower
"""

import os
import wave
import tempfile
import numpy as np

# ── optional heavy imports ─────────────────────────────────────────────────

try:
    import librosa
    _LIBROSA = True
except ImportError:
    _LIBROSA = False

try:
    import torch  # noqa: F401 — ensures SpeechBrain can import
    from speechbrain.inference.interfaces import foreign_class as _sb_foreign
    _SPEECHBRAIN = True
except ImportError:
    _SPEECHBRAIN = False

try:
    from deepface import DeepFace as _DeepFace
    import cv2 as _cv2
    _DEEPFACE = True
except ImportError:
    _DEEPFACE = False

# ── SpeechBrain lazy singleton ─────────────────────────────────────────────

_sb_classifier = None

def _get_classifier():
    global _sb_classifier
    if _sb_classifier is None:
        _sb_classifier = _sb_foreign(
            source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
            pymodule_file="custom_interface.py",
            classname="CustomEncoderWav2vec2Classifier",
        )
    return _sb_classifier

# ── morph target mapping ───────────────────────────────────────────────────

# IEMOCAP short labels → avatar blend shapes
_MORPH: dict[str, dict] = {
    "neu":       {},
    "neutral":   {},
    "hap":       {"brow_raise": 0.5},
    "happiness": {"brow_raise": 0.5},
    "happy":     {"brow_raise": 0.5},
    "ang":       {"brow_lower": 0.8},
    "anger":     {"brow_lower": 0.8},
    "angry":     {"brow_lower": 0.8},
    "sad":       {"brow_lower": 0.3},
    "sadness":   {"brow_lower": 0.3},
    "surprise":  {"brow_raise": 0.9},
    "fear":      {"brow_raise": 0.4, "brow_lower": 0.3},
    "disgust":   {"brow_lower": 0.5},
}

# ── helpers ────────────────────────────────────────────────────────────────

def _pcm16_to_float32(pcm16_bytes: bytes, src_sr: int) -> np.ndarray:
    samples = np.frombuffer(pcm16_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    if _LIBROSA and src_sr != 16000:
        samples = librosa.resample(samples, orig_sr=src_sr, target_sr=16000)
    return samples


def _write_wav_16k(samples: np.ndarray) -> str:
    """Write float32 samples (16 kHz mono) to a temp WAV file. Returns path."""
    pcm = (samples * 32767).clip(-32768, 32767).astype(np.int16)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    with wave.open(tmp.name, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(pcm.tobytes())
    return tmp.name

# ── public API ─────────────────────────────────────────────────────────────

def preload() -> None:
    """Pre-warm the SpeechBrain classifier. Call once at app startup."""
    if _SPEECHBRAIN:
        _get_classifier()


def analyze_audio_sync(pcm16_bytes: bytes, src_sr: int = 48000) -> dict:
    """
    Run SpeechBrain emotion classification + librosa energy on raw PCM16 bytes.
    Safe to call from asyncio.to_thread().
    Needs ≥ ~0.5 s of audio (48 kHz PCM16 = ≥ 48 000 bytes).
    """
    fallback = {"emotion": "neutral", "intensity": 0.0, "morphTargets": {}}

    if not _SPEECHBRAIN or not _LIBROSA:
        return fallback
    if len(pcm16_bytes) < 48_000:   # < 0.5 s at 48 kHz
        return fallback

    try:
        samples = _pcm16_to_float32(pcm16_bytes, src_sr)

        # Energy → intensity
        rms = float(np.sqrt(np.mean(samples ** 2)))
        intensity = round(min(1.0, rms * 12), 3)

        # Emotion label
        wav_path = _write_wav_16k(samples)
        try:
            _, _, _, label = _get_classifier().classify_file(wav_path)
            emotion = (label[0] if isinstance(label, list) else str(label)).lower()
        finally:
            os.unlink(wav_path)

        morph = _MORPH.get(emotion, {})
        # Scale morph by intensity (floor at 0.5 so face still shows at quiet speech)
        morph = {k: round(v * max(0.5, intensity), 3) for k, v in morph.items()}

        return {"emotion": emotion, "intensity": intensity, "morphTargets": morph}

    except Exception:
        return fallback


def analyze_face_sync(jpeg_bytes: bytes) -> dict:
    """
    Run DeepFace on a JPEG image. Returns {"emotion": str} or {} on failure.
    Safe to call from asyncio.to_thread().
    """
    if not _DEEPFACE or not jpeg_bytes:
        return {}
    try:
        nparr = np.frombuffer(jpeg_bytes, np.uint8)
        img = _cv2.imdecode(nparr, _cv2.IMREAD_COLOR)
        result = _DeepFace.analyze(img, actions=["emotion"], enforce_detection=False, silent=True)
        entries = result if isinstance(result, list) else [result]
        dominant = entries[0]["dominant_emotion"]
        return {"emotion": dominant}
    except Exception:
        return {}


def merge_emotion(audio_result: dict, face_result: dict) -> dict:
    """
    Merge audio and face emotion results.
    Face wins unless it's an uninformative class (neutral/fear/disgust).
    """
    face_em = face_result.get("emotion", "")
    if face_em and face_em not in ("neutral", "fear", "disgust"):
        merged = face_em
    else:
        merged = audio_result.get("emotion", "neutral")

    return {
        "emotion":      merged,
        "intensity":    audio_result.get("intensity", 0.0),
        "morphTargets": _MORPH.get(merged, {}),
    }
