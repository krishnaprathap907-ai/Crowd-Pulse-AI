import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager

# Ensure repository root is on sys.path for serverless environments
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.config import settings
from backend.app.core.database import Base, engine
from backend.app.api import (
    auth, reports, incidents, analytics, map as map_api,
    notifications, admin, demo, copilot, radar, resolutions, governance
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database tables exist
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Database init notice: {e}")

    try:
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    except Exception as e:
        print(f"Upload dir notice: {e}")
    
    # Auto-seed if database is new
    try:
        from scripts.seed_demo import run_seed
        run_seed()
    except Exception as e:
        print(f"Startup seed notice: {e}")
    yield

app = FastAPI(
    title="CrowdPulse TN API",
    description="Collective Civic Issue Intelligence and Incident Early Warning Platform for Tamil Nadu",
    version="2.0.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(map_api.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(demo.router, prefix="/api")
app.include_router(copilot.router, prefix="/api")
app.include_router(radar.router, prefix="/api")
app.include_router(resolutions.router, prefix="/api")
app.include_router(governance.router, prefix="/api")

# Static files
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
static_dir = os.path.join(frontend_dir, "static")
uploads_dir = os.path.join(frontend_dir, "uploads")

try:
    os.makedirs(static_dir, exist_ok=True)
    os.makedirs(uploads_dir, exist_ok=True)
except Exception:
    pass

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
if os.path.exists(uploads_dir):
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "CrowdPulse TN",
        "environment": settings.ENVIRONMENT,
        "clustering_engine": "active"
    }

# SPA Fallback Route: Serve index.html for web client navigation
@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    # If path starts with api/, return 404 json
    if full_path.startswith("api/"):
        return {"error": "API route not found"}
    index_file = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "CrowdPulse TN Frontend Loading"}
