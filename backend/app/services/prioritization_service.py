import datetime
from typing import Dict, Any, Optional
from backend.app.models.models import Incident, PriorityLevel

CATEGORY_BASE_HAZARD = {
    "open drain": 28.0,
    "live wire": 30.0,
    "electrical hazard": 30.0,
    "drinking water contamination": 27.0,
    "water supply disruption": 20.0,
    "sewage overflow": 23.0,
    "flooding / waterlogging": 25.0,
    "major road cave-in": 25.0,
    "pothole": 15.0,
    "traffic signal failure": 18.0,
    "garbage overflow": 14.0,
    "street light failure": 10.0,
    "stray animal menace": 12.0,
    "public park maintenance": 8.0,
}

CRITICAL_AREAS = [
    "t. nagar", "anna nagar", "velachery", "guindy", "parrys", "central",
    "hospital", "school", "metro", "bus terminus", "railway station"
]

class PrioritizationService:
    @staticmethod
    def calculate_priority(
        category_name: str,
        report_count: int,
        unique_reporters: int,
        geographic_area: str,
        avg_severity_score: float = 0.5,
        created_at: Optional[datetime.datetime] = None,
        manual_override: bool = False,
        override_band: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calculates 0-100 Multi-Factor Smart Incident Priority Score and SLA deadline.
        """
        if manual_override and override_band:
            band = override_band.lower()
            score_map = {"critical": 90.0, "high": 75.0, "medium": 50.0, "low": 25.0}
            score = score_map.get(band, 50.0)
            sla_hours = {"critical": 4, "high": 12, "medium": 24, "low": 48}.get(band, 24)
            due_date = (created_at or datetime.datetime.now(datetime.timezone.utc)) + datetime.timedelta(hours=sla_hours)
            return {
                "priority_score": score,
                "priority_band": band,
                "sla_hours": sla_hours,
                "sla_due_date": due_date,
                "breakdown": {
                    "hazard_factor": score * 0.3,
                    "velocity_factor": score * 0.25,
                    "sensitivity_factor": score * 0.2,
                    "ai_severity_factor": score * 0.15,
                    "sla_urgency_factor": score * 0.1,
                    "is_manual_override": True
                }
            }

        cat_key = category_name.lower().strip()
        hazard_score = 12.0
        for k, v in CATEGORY_BASE_HAZARD.items():
            if k in cat_key:
                hazard_score = v
                break

        # Velocity & Volume factor (0 to 25)
        # 1 report = 5, 3 reports = 14, 5+ reports = 22, 10+ reports = 25
        volume_factor = min(25.0, (report_count * 3.5) + (unique_reporters * 1.5))

        # Sensitivity factor (0 to 20)
        area_str = (geographic_area or "").lower()
        is_sensitive = any(crit in area_str for crit in CRITICAL_AREAS)
        sensitivity_score = 18.0 if is_sensitive else 8.0

        # AI Severity factor (0 to 15)
        ai_severity = min(15.0, max(0.0, avg_severity_score * 15.0))

        # SLA / Aging factor (0 to 10)
        now = datetime.datetime.now(datetime.timezone.utc)
        age_hours = 0.0
        if created_at:
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=datetime.timezone.utc)
            age_hours = max(0.0, (now - created_at).total_seconds() / 3600.0)
        sla_urgency = min(10.0, age_hours * 0.5)

        total_score = round(min(100.0, max(5.0, hazard_score + volume_factor + sensitivity_score + ai_severity + sla_urgency)), 1)

        if total_score >= 80.0:
            band = PriorityLevel.CRITICAL
            sla_hours = 4
        elif total_score >= 60.0:
            band = PriorityLevel.HIGH
            sla_hours = 12
        elif total_score >= 40.0:
            band = PriorityLevel.MEDIUM
            sla_hours = 24
        else:
            band = PriorityLevel.LOW
            sla_hours = 48

        base_time = created_at or now
        sla_due_date = base_time + datetime.timedelta(hours=sla_hours)

        return {
            "priority_score": total_score,
            "priority_band": band,
            "sla_hours": sla_hours,
            "sla_due_date": sla_due_date,
            "breakdown": {
                "hazard_score": hazard_score,
                "volume_factor": round(volume_factor, 1),
                "sensitivity_score": sensitivity_score,
                "ai_severity": round(ai_severity, 1),
                "sla_urgency": round(sla_urgency, 1),
                "is_manual_override": False
            }
        }
