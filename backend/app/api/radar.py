from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any

from backend.app.core.database import get_db
from backend.app.models.models import EmergingRiskForecast, CivicCategory
from backend.app.services.early_warning_service import EarlyWarningService

router = APIRouter(prefix="/radar", tags=["Emerging Issue Radar"])

@router.get("/forecasts")
def get_risk_forecasts(
    risk_level: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Returns active emerging risk forecasts across Tamil Nadu municipal wards.
    """
    forecasts = EarlyWarningService.get_active_forecasts(db, risk_level=risk_level)
    return {
        "count": len(forecasts),
        "forecasts": forecasts
    }

@router.post("/recalculate")
def recalculate_radar_forecasts(
    db: Session = Depends(get_db)
):
    """
    Triggers on-demand recalculated velocity spikes and anomalies against historical baselines.
    """
    new_forecasts = EarlyWarningService.recalculate_forecasts(db)
    return {
        "status": "success",
        "generated_forecasts": len(new_forecasts),
        "message": "Emerging Risk Radar successfully synchronized with recent reports."
    }

@router.get("/summary")
def get_radar_summary(
    db: Session = Depends(get_db)
):
    """
    Returns aggregated stats for early warning dashboard widgets.
    """
    active = db.query(EmergingRiskForecast).filter(EmergingRiskForecast.is_active == True).all()
    
    critical_count = sum(1 for f in active if f.risk_level == "critical")
    high_count = sum(1 for f in active if f.risk_level == "high")
    medium_count = sum(1 for f in active if f.risk_level == "medium")
    low_count = sum(1 for f in active if f.risk_level == "low")
    
    top_spikes = sorted(active, key=lambda x: x.growth_rate_pct, reverse=True)[:5]
    categories = {c.id: c.name for c in db.query(CivicCategory).all()}

    return {
        "total_active_clusters": len(active),
        "critical_count": critical_count,
        "high_count": high_count,
        "medium_count": medium_count,
        "low_count": low_count,
        "top_spikes": [{
            "id": s.id,
            "geographic_area": s.geographic_area,
            "category_name": categories.get(s.category_id, "Civic Issue"),
            "growth_rate_pct": s.growth_rate_pct,
            "current_volume": s.current_volume,
            "risk_level": s.risk_level,
            "recommendation": s.recommendation
        } for s in top_spikes]
    }
