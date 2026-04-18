from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from src.routes.stt import router as stt_router
from src.routes.isl_recognition import router as isl_router
from src.routes.hear import router as hear_router
from src.routes.simulator import router as simulator_router

app = FastAPI(title="HackHelix Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
        "http://localhost:5173",  # frontend-new (Vite)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stt_router)
app.include_router(isl_router)
app.include_router(hear_router)
app.include_router(simulator_router)

@app.get("/health")
async def health():
    return {"status": "ok"}
