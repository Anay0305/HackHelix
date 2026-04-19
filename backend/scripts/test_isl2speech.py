"""Smoke-test the /ws/simulator isl2speech path end-to-end.

Connects to the running backend, sends a `start` then a burst of fake
landmark frames representing an open hand held still, then collects
whatever the server emits.
"""

import asyncio
import json
import sys

import websockets


OPEN_HAND_FLAT = [
    0.50,0.72,0, 0.38,0.65,0, 0.30,0.57,0, 0.24,0.49,0, 0.19,0.42,0,
    0.43,0.61,0, 0.42,0.49,0, 0.42,0.38,0, 0.42,0.27,0,
    0.50,0.59,0, 0.50,0.47,0, 0.50,0.36,0, 0.50,0.24,0,
    0.57,0.61,0, 0.58,0.49,0, 0.58,0.38,0, 0.58,0.27,0,
    0.63,0.64,0, 0.64,0.55,0, 0.64,0.47,0, 0.64,0.40,0,
]


async def main() -> int:
    url = "ws://127.0.0.1:8000/ws/simulator"
    print(f"connecting {url}")
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({
            "type": "start",
            "mode": "isl2speech",
            "sessionId": "smoke-test",
        }))

        # 20 almost-identical frames so the hand is "still" > 0.5 s @ 15 fps
        for i in range(20):
            frame = {
                "pose":      [],
                "rightHand": OPEN_HAND_FLAT,
                "leftHand":  [],
                "face":      [],
            }
            await ws.send(json.dumps({
                "type": "landmarks",
                "seq":  i,
                "frame": frame,
            }))
            await asyncio.sleep(0.07)

        # Wait for responses — flush_buffer sleeps SILENCE_TIMEOUT=1.5s before TTS
        try:
            for _ in range(15):
                msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                data = json.loads(msg)
                preview = str(data)[:180]
                print(f"  <-- {data.get('type')}: {preview}")
                if data.get("type") == "tts_ready":
                    break
        except asyncio.TimeoutError:
            print("  (no more messages)")
        finally:
            await ws.send(json.dumps({"type": "stop"}))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
