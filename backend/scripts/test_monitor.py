"""Smoke-test the /ws/monitor endpoint.

Generates 3 s of silence + 1 s of a 440 Hz tone, chunks it, base64-encodes
PCM16, and sends it over the websocket. Success is: a `ready` reply, one
or more `status` ticks, and no error. (We don't expect an `alert` from a
pure sine wave — that would require a real fire-alarm recording.)
"""

import asyncio
import base64
import json
import math

import websockets


SAMPLE_RATE = 16_000
DURATION = 4.0
CHUNK_SAMPLES = 4096


def generate_audio() -> bytes:
    samples: list[int] = []
    total = int(SAMPLE_RATE * DURATION)
    for i in range(total):
        t = i / SAMPLE_RATE
        if t < 3.0:
            samples.append(0)
        else:
            samples.append(int(0.3 * 32767 * math.sin(2 * math.pi * 440.0 * t)))
    # little-endian int16
    import array
    return array.array("h", samples).tobytes()


async def main() -> int:
    url = "ws://127.0.0.1:8000/ws/monitor"
    print(f"connecting {url}")
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"type": "start", "sampleRate": SAMPLE_RATE}))
        audio = generate_audio()
        chunk_bytes = CHUNK_SAMPLES * 2
        for i in range(0, len(audio), chunk_bytes):
            chunk = audio[i : i + chunk_bytes]
            await ws.send(json.dumps({
                "type": "audio_chunk",
                "pcm16Base64": base64.b64encode(chunk).decode(),
            }))
            await asyncio.sleep(CHUNK_SAMPLES / SAMPLE_RATE)

        # drain
        try:
            for _ in range(8):
                msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                data = json.loads(msg)
                print(f"  <-- {data.get('type')}: {str(data)[:160]}")
        except asyncio.TimeoutError:
            print("  (no more messages)")
        await ws.send(json.dumps({"type": "stop"}))
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
