from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.models.models import Report, Incident, IncidentReport, IncidentStatus
from backend.app.schemas.schemas import MapReportPoint, MapIncidentPoint

router = APIRouter(prefix="/map", tags=["Interactive Map"])

@router.get("/reports", response_model=List[MapReportPoint])
def get_map_reports(
    category_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(250, le=500),
    db: Session = Depends(get_db)
):
    query = db.query(Report)
    if category_id:
        query = query.filter(Report.category_id == category_id)
    if status:
        query = query.filter(Report.status == status)

    reports = query.order_by(Report.created_at.desc()).limit(limit).all()

    points = []
    for r in reports:
        inc_link = db.query(IncidentReport).filter(IncidentReport.report_id == r.id).first()
        inc_id = inc_link.incident_id if inc_link else None

        points.append(MapReportPoint(
            id=r.id,
            reference_no=r.reference_no,
            title=r.title,
            category_name=r.category.name if r.category else "Civic Issue",
            category_color=r.category.color if r.category else "#0F9D8A",
            latitude=r.latitude,
            longitude=r.longitude,
            status=r.status,
            severity=r.severity,
            created_at=r.created_at,
            incident_id=inc_id
        ))
    return points

@router.get("/incidents", response_model=List[MapIncidentPoint])
def get_map_incidents(
    category_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Incident).filter(Incident.status != IncidentStatus.MERGED)
    if category_id:
        query = query.filter(Incident.category_id == category_id)
    if status:
        query = query.filter(Incident.status == status)

    incidents = query.all()

    points = []
    for inc in incidents:
        points.append(MapIncidentPoint(
            id=inc.id,
            incident_number=inc.incident_number,
            title=inc.title,
            category_name=inc.category.name if inc.category else "Civic Issue",
            category_color=inc.category.color if inc.category else "#0F9D8A",
            latitude=inc.center_latitude,
            longitude=inc.center_longitude,
            radius_meters=inc.radius_meters,
            status=inc.status,
            priority=inc.priority,
            report_count=inc.report_count,
            area=inc.geographic_area,
            is_candidate=(inc.status == IncidentStatus.CANDIDATE),
            created_at=inc.created_at
        ))
    return points
