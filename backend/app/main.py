import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB init runs in the background: Neon's first connection can take ~5-10s
    # (cold start / pooler latency). The server accepts requests immediately;
    # the first DB-backed request simply waits for the warm-up connection.
    threading.Thread(target=init_db, daemon=True).start()
    yield


app = FastAPI(
    title="MedRush AI API",
    description=(
        "AI-based hospital resource prediction & ambulance route optimization system. "
        "All endpoints are documented; authentication via Bearer JWT. "
        "AI outputs are decision-support only — emergency medical decisions remain with qualified professionals."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import ai, ambulances, auth, drivers, emergencies, hospitals, notifications, patients, ws  # noqa: E402
from app.routers import admin  # noqa: E402

app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(emergencies.router)
app.include_router(drivers.router)
app.include_router(ambulances.router)
app.include_router(hospitals.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(ws.router)


@app.get("/api/health", tags=["system"], summary="Health check")
def health():
    return {"status": "ok", "app": settings.app_name, "version": "1.0.0"}