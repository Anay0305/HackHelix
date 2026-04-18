import asyncio
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from deepgram import DeepgramClient, LiveTranscriptionEvents, LiveOptions

router = APIRouter()

@router.websocket("/ws/stt")
async def stt_websocket(
    ws: WebSocket,
    sampleRate: int = Query(default=16000),
):
    await ws.accept()

    api_key = os.getenv("DEEPGRAM_API_KEY", "")
    dg = DeepgramClient(api_key)
    dg_connection = dg.listen.asyncwebsocket.v("1")

    async def on_transcript(self, result, **kwargs):
        try:
            sentence = result.channel.alternatives[0].transcript
            if not sentence:
                return
            await ws.send_json({
                "type": "transcript",
                "text": sentence,
                "is_final": result.is_final,
            })
        except Exception:
            pass

    async def on_error(self, error, **kwargs):
        await ws.send_json({"type": "error", "message": str(error)})

    dg_connection.on(LiveTranscriptionEvents.Transcript, on_transcript)
    dg_connection.on(LiveTranscriptionEvents.Error, on_error)

    options = LiveOptions(
        model="nova-2",
        language="en-IN",
        encoding="linear16",
        sample_rate=sampleRate,
        channels=1,
        smart_format=True,
        interim_results=True,
        endpointing=300,
        punctuate=True,
    )

    await dg_connection.start(options)

    try:
        while True:
            data = await ws.receive_bytes()
            await dg_connection.send(data)
    except WebSocketDisconnect:
        pass
    finally:
        await dg_connection.finish()
