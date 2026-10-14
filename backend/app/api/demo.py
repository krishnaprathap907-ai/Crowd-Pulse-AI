import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.database import get_db, Base, engine
from backend.app.scripts_helper import run_seed_helper
from backend.app.models.models import (
    Incident, Report, User, IncidentStatus, PriorityLevel
)
from backend.app.geo.detector import detector

router = APIRouter(prefix="/demo", tags=["Demonstration"])

@router.api_route("/seed", methods=["GET", "POST"])
def seed_demo_data(db: Session = Depends(get_db)):
    """
    Seeds realistic demonstration accounts and scenario records.
    """
    try:
        import scripts.copy_assets
    except Exception as e:
        print(f"Copy assets notice: {e}")

    from scripts.seed_demo import run_seed
    try:
        run_seed()
        return {
            "message": "Demo data successfully initialized",
            "demo_accounts": [
                {"role": "Citizen", "email": "citizen@crowdpulse.tn", "password": "DemoPass123!"},
                {"role": "Authority Officer", "email": "officer@crowdpulse.tn", "password": "DemoPass123!"},
                {"role": "Department Staff", "email": "staff.roads@crowdpulse.tn", "password": "DemoPass123!"},
                {"role": "Administrator", "email": "admin@crowdpulse.tn", "password": "DemoPass123!"}
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reset")
def reset_demo_data():
    """
    Clears demonstration and transient database records and reseeds base entities.
    """
    from scripts.seed_demo import run_seed
    try:
        Base.metadata.drop_all(bind=engine)
        run_seed()
        return {"message": "Database reset and reseeded with clean demonstration baseline."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
