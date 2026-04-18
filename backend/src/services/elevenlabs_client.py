"""ElevenLabs TTS — returns MP3 audio bytes for a given text."""

import os
import httpx

ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


async def synthesize(text: str) -> bytes:
    """Convert text to speech using ElevenLabs. Returns raw MP3 bytes."""
    api_key  = os.getenv("ELEVENLABS_API_KEY", "")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

    url = ELEVENLABS_API_URL.format(voice_id=voice_id)

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            url,
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_turbo_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                },
            },
        )
        response.raise_for_status()
        return response.content
