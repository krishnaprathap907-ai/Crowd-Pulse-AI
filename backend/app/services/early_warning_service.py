import datetime
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.models.models import (
    Report, CivicCategory, EmergingRiskForecast, PriorityLevel
)
from backend.app.core.database import utcnow

# Curated actionable municipal mitigation templates for Tamil Nadu cities
RECOMMENDATIONS_MAP = {
    "waterlogging": "Deploy GCC high-capacity dewatering pumps (100 HP) and clear macro-drain inlets immediately.",
    "flooding": "Issue public route advisory; dispatch State Disaster Response Force (SDRF) suction vehicles.",
    "sewage": "Dispatch CMWSSB super-sucker jetting machine to clear underground trunk sewer blockage.",
    "water contamination": "Isolate municipal distribution feeder; collect chlorine residual test samples; dispatch emergency drinking water tankers.",
    "live wire": "Notify TANGEDCO substations for rapid section isolation; cordon off roadway with safety barricades.",
    "electrical": "Dispatch TANGEDCO mobile line maintenance squad; conduct infrared thermography of transformer junctions.",
    "garbage": "Deploy Urbaser Sumeet compactors for emergency clearance; sanitize area with bleaching powder.",
    "road": "Deploy Highways Department cold-mix asphalt patching squad; install reflective caution signage.",
    "traffic": "Deploy Greater Chennai Traffic Police (GCTP) traffic warden and dispatch signal maintenance contractor."
}

class EarlyWarningService:
    @staticmethod
    def recalculate_forecasts(db: Session) -> List[EmergingRiskForecast]:
        """
        Analyzes recent reports versus historical baseline and generates/updates EmergingRiskForecast entries.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        recent_window = now - datetime.timedelta(hours=24)
        baseline_start = now - datetime.timedelta(days=7)

        # Get categories
        categories = db.query(CivicCategory).all()
        cat_map = {c.id: c.name for c in categories}

        # Query recent report counts grouped by address and category_id
        recent_counts = db.query(
            func.coalesce(Report.address, "Chennai Central").label("geographic_area"),
            Report.district,
            Report.category_id,
            func.count(Report.id).label("count")
        ).filter(
            Report.created_at >= recent_window
        ).group_by(
            Report.address,
            Report.district,
            Report.category_id
        ).all()

        # Query historical counts (7 days)
        baseline_counts = db.query(
            func.coalesce(Report.address, "Chennai Central").label("geographic_area"),
            Report.category_id,
            func.count(Report.id).label("count")
        ).filter(
            Report.created_at >= baseline_start,
            Report.created_at < recent_window
        ).group_by(
            Report.address,
            Report.category_id
        ).all()

        baseline_lookup = {}
        for row in baseline_counts:
            # daily average over 6 days
            baseline_lookup[(row.geographic_area, row.category_id)] = max(0.5, row.count / 6.0)

        # Deactivate old forecasts
        db.query(EmergingRiskForecast).update({EmergingRiskForecast.is_active: False})

        new_forecasts = []
        for row in recent_counts:
            area = row.geographic_area or "Central Zone"
            district = row.district or "Chennai"
            cat_id = row.category_id
            cat_name = cat_map.get(cat_id, "Civic Issue").lower()
            current_vol = row.count
            baseline_vol = baseline_lookup.get((area, cat_id), 1.0)

            # Growth rate percentage
            growth_pct = round(((current_vol - baseline_vol) / baseline_vol) * 100.0, 1)

            # Determine risk level
            if (growth_pct >= 200.0 and current_vol >= 4) or any(k in cat_name for k in ["live wire", "electrical", "water contamination"]):
                risk = PriorityLevel.CRITICAL
                confidence = 0.94
            elif growth_pct >= 100.0 and current_vol >= 3:
                risk = PriorityLevel.HIGH
                confidence = 0.88
            elif growth_pct >= 40.0 or current_vol >= 2:
                risk = PriorityLevel.MEDIUM
                confidence = 0.82
            else:
                risk = PriorityLevel.LOW
                confidence = 0.75

            # Find matching recommendation
            rec = "Deploy field inspection officer to inspect civic infrastructure and verify reporter claims."
            for k, text in RECOMMENDATIONS_MAP.items():
                if k in cat_name:
                    rec = text
                    break

            forecast = EmergingRiskForecast(
                geographic_area=area,
                district=district,
                category_id=cat_id,
                risk_level=risk,
                current_volume=current_vol,
                baseline_volume=round(baseline_vol, 2),
                growth_rate_pct=growth_pct,
                confidence=confidence,
                recommendation=f"{rec} (Spike detected: +{growth_pct}% above 7-day baseline)",
                is_active=True,
                created_at=utcnow()
            )
            db.add(forecast)
            new_forecasts.append(forecast)

        db.commit()
        for f in new_forecasts:
            db.refresh(f)
        return new_forecasts

    @staticmethod
    def get_active_forecasts(db: Session, risk_level: str = None) -> List[Dict[str, Any]]:
        query = db.query(EmergingRiskForecast).filter(EmergingRiskForecast.is_active == True)
        if risk_level:
            query = query.filter(EmergingRiskForecast.risk_level == risk_level.lower())
        
        forecasts = query.order_by(EmergingRiskForecast.growth_rate_pct.desc()).all()
        categories = {c.id: c.name for c in db.query(CivicCategory).all()}

        results = []
        for f in forecasts:
            results.append({
                "id": f.id,
                "geographic_area": f.geographic_area,
                "district": f.district,
                "category_id": f.category_id,
                "category_name": categories.get(f.category_id, "Civic Issue"),
                "risk_level": f.risk_level,
                "current_volume": f.current_volume,
                "baseline_volume": f.baseline_volume,
                "growth_rate_pct": f.growth_rate_pct,
                "confidence": f.confidence,
                "recommendation": f.recommendation,
                "created_at": f.created_at.isoformat() if f.created_at else None
            })
        return results
