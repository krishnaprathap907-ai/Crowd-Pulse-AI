from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.models.models import (
    Incident, IncidentReport, IncidentAssignment, Department, User, UserRole,
    StatusHistory, Notification, AlertEvent, AuditLog, Report, IncidentStatus, PriorityLevel
)
from backend.app.schemas.schemas import (
    IncidentOut, IncidentDetailOut, IncidentVerifyRequest, IncidentAssignRequest,
    IncidentStatusUpdate, IncidentMergeRequest, IncidentNotesRequest, ReportOut
)
from backend.app.api.deps import get_current_user_optional, get_current_user, require_authority, require_staff

router = APIRouter(prefix="/incidents", tags=["Incidents"])

@router.get("", response_model=List[IncidentOut])
def list_incidents(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    is_candidate: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Incident)

    if is_candidate is True:
        query = query.filter(Incident.status == IncidentStatus.CANDIDATE)
    elif is_candidate is False:
        query = query.filter(Incident.status != IncidentStatus.CANDIDATE)
    elif status:
        query = query.filter(Incident.status == status)

    if priority:
        query = query.filter(Incident.priority == priority)
    if category_id:
        query = query.filter(Incident.category_id == category_id)
    if department_id:
        query = query.filter(Incident.assigned_department_id == department_id)
    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            (Incident.title.ilike(search_fmt)) |
            (Incident.incident_number.ilike(search_fmt)) |
            (Incident.geographic_area.ilike(search_fmt))
        )

    incidents = query.order_by(Incident.latest_activity_at.desc()).offset(offset).limit(limit).all()

    now = datetime.now(timezone.utc)
    result = []
    for inc in incidents:
        dept_name = inc.assigned_department.name if inc.assigned_department else None
        
        # Check overdue status
        due = inc.sla_due_date
        is_overdue = False
        if due:
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            is_overdue = (now > due) and (inc.status not in [IncidentStatus.RESOLVED, IncidentStatus.REJECTED, IncidentStatus.MERGED])

        result.append(IncidentOut(
            id=inc.id,
            incident_number=inc.incident_number,
            title=inc.title,
            category_id=inc.category_id,
            category_name=inc.category.name if inc.category else "Civic",
            category_color=inc.category.color if inc.category else "#0F9D8A",
            category_icon=inc.category.icon if inc.category else "AlertCircle",
            description=inc.description,
            geographic_area=inc.geographic_area,
            district=inc.district,
            center_latitude=inc.center_latitude,
            center_longitude=inc.center_longitude,
            radius_meters=inc.radius_meters,
            status=inc.status,
            priority=inc.priority,
            priority_score=inc.priority_score or 50.0,
            sla_due_date=inc.sla_due_date,
            is_overdue=is_overdue,
            report_count=inc.report_count,
            unique_reporter_count=inc.unique_reporter_count,
            first_reported_at=inc.first_reported_at,
            latest_activity_at=inc.latest_activity_at,
            assigned_department_id=inc.assigned_department_id,
            assigned_department_name=dept_name,
            resolution_evidence_url=inc.resolution_evidence_url,
            is_demo=inc.is_demo,
            created_at=inc.created_at
        ))
    return result

@router.get("/{id}", response_model=IncidentDetailOut)
def get_incident_detail(
    id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Civic incident not found.")

    # Supporting reports
    reports_out = []
    for link in inc.report_associations:
        r = link.report
        reports_out.append(ReportOut(
            id=r.id,
            reference_no=r.reference_no,
            title=r.title,
            description=r.description,
            category_id=r.category_id,
            category_name=r.category.name if r.category else "General",
            category_icon=r.category.icon if r.category else "AlertCircle",
            category_color=r.category.color if r.category else "#0F9D8A",
            latitude=r.latitude,
            longitude=r.longitude,
            address=r.address,
            landmark=r.landmark,
            district=r.district,
            severity=r.severity,
            status=r.status,
            created_at=r.created_at,
            has_incident=True,
            incident_number=inc.incident_number
        ))

    # Status history
    histories = db.query(StatusHistory).filter(
        StatusHistory.entity_type == "incident",
        StatusHistory.entity_id == inc.id
    ).order_by(StatusHistory.created_at.desc()).all()

    hist_out = [
        {
            "previous_status": h.previous_status,
            "new_status": h.new_status,
            "actor": h.actor_name,
            "notes": h.notes,
            "created_at": h.created_at.isoformat()
        } for h in histories
    ]

    dept_name = inc.assigned_department.name if inc.assigned_department else None
    now = datetime.now(timezone.utc)
    
    # Hide internal notes from public citizens
    internal_notes = inc.internal_notes if (current_user and current_user.role != UserRole.CITIZEN) else None

    return IncidentDetailOut(
        id=inc.id,
        incident_number=inc.incident_number,
        title=inc.title,
        category_id=inc.category_id,
        category_name=inc.category.name if inc.category else "Civic",
        category_color=inc.category.color if inc.category else "#0F9D8A",
        category_icon=inc.category.icon if inc.category else "AlertCircle",
        description=inc.description,
        geographic_area=inc.geographic_area,
        district=inc.district,
        center_latitude=inc.center_latitude,
        center_longitude=inc.center_longitude,
        radius_meters=inc.radius_meters,
        status=inc.status,
        priority=inc.priority,
        priority_score=inc.priority_score or 50.0,
        sla_due_date=inc.sla_due_date,
        is_overdue=(now > inc.sla_due_date) if inc.sla_due_date else False,
        priority_breakdown=inc.priority_breakdown,
        match_signals_breakdown=inc.match_signals_breakdown,
        report_count=inc.report_count,
        unique_reporter_count=inc.unique_reporter_count,
        first_reported_at=inc.first_reported_at,
        latest_activity_at=inc.latest_activity_at,
        assigned_department_id=inc.assigned_department_id,
        assigned_department_name=dept_name,
        detection_reason=inc.detection_reason,
        evidence_summary=inc.evidence_summary or {},
        public_update=inc.public_update,
        internal_notes=internal_notes,
        resolution_notes=inc.resolution_notes,
        resolution_evidence_url=inc.resolution_evidence_url,
        resolved_at=inc.resolved_at,
        is_demo=inc.is_demo,
        created_at=inc.created_at,
        reports=reports_out,
        status_history=hist_out
    )

@router.post("/{id}/verify")
def verify_incident(
    id: int,
    payload: IncidentVerifyRequest,
    current_user: User = Depends(require_authority),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")

    prev_status = inc.status
    if payload.verified:
        inc.status = IncidentStatus.VERIFIED
        if payload.priority:
            inc.priority = payload.priority
        action_note = f"Verified as official incident by {current_user.full_name}. Priority: {inc.priority}."
    else:
        inc.status = IncidentStatus.REJECTED
        action_note = f"Rejected candidate by {current_user.full_name}. Notes: {payload.notes or 'Insufficient collective pattern'}."

    if payload.notes:
        action_note += f" Details: {payload.notes}"

    db.add(StatusHistory(
        entity_type="incident",
        entity_id=inc.id,
        previous_status=prev_status,
        new_status=inc.status,
        changed_by_user_id=current_user.id,
        actor_name=current_user.full_name,
        notes=action_note
    ))

    # Audit log
    db.add(AuditLog(
        user_id=current_user.id,
        action="INCIDENT_VERIFIED" if payload.verified else "INCIDENT_REJECTED",
        entity_type="incident",
        entity_id=inc.id,
        details_json={"priority": inc.priority, "notes": payload.notes}
    ))

    # Notify contributing citizens if verified
    if payload.verified:
        for link in inc.report_associations:
            if link.report.citizen_id:
                db.add(Notification(
                    user_id=link.report.citizen_id,
                    title="Incident Officially Verified",
                    message=f"Incident #{inc.incident_number} containing your report has been officially verified by civic authorities.",
                    type="info",
                    entity_type="incident",
                    entity_id=inc.id,
                    link=f"/citizen/my-reports"
                ))

    db.commit()
    return {"message": "Incident verification updated", "status": inc.status}

@router.post("/{id}/assign")
def assign_incident(
    id: int,
    payload: IncidentAssignRequest,
    current_user: User = Depends(require_authority),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")

    dept = db.query(Department).filter(Department.id == payload.department_id).first()
    if not dept:
        raise HTTPException(status_code=400, detail="Invalid department ID.")

    prev_status = inc.status
    inc.assigned_department_id = dept.id
    inc.status = IncidentStatus.ASSIGNED
    if payload.priority:
        inc.priority = payload.priority

    db.add(IncidentAssignment(
        incident_id=inc.id,
        department_id=dept.id,
        assigned_by_user_id=current_user.id,
        assigned_to_user_id=payload.staff_id,
        notes=payload.notes,
        status="active"
    ))

    db.add(StatusHistory(
        entity_type="incident",
        entity_id=inc.id,
        previous_status=prev_status,
        new_status=IncidentStatus.ASSIGNED,
        changed_by_user_id=current_user.id,
        actor_name=current_user.full_name,
        notes=f"Assigned to {dept.name} ({dept.code}). Priority: {inc.priority}. Notes: {payload.notes or 'None'}"
    ))

    db.add(AuditLog(
        user_id=current_user.id,
        action="INCIDENT_ASSIGNED",
        entity_type="incident",
        entity_id=inc.id,
        details_json={"department": dept.name, "notes": payload.notes}
    ))

    db.commit()
    return {"message": f"Assigned to {dept.name}", "status": inc.status}

@router.patch("/{id}/status")
def update_incident_status(
    id: int,
    payload: IncidentStatusUpdate,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")

    valid_transitions = [
        IncidentStatus.IN_PROGRESS, IncidentStatus.RESOLVED_PENDING,
        IncidentStatus.CLOSED, IncidentStatus.VERIFIED
    ]
    if payload.status not in valid_transitions:
        raise HTTPException(status_code=400, detail=f"Invalid target status {payload.status}")

    prev_status = inc.status
    inc.status = payload.status
    if payload.public_update:
        inc.public_update = payload.public_update
    if payload.resolution_notes:
        inc.resolution_notes = payload.resolution_notes
    if payload.status in [IncidentStatus.RESOLVED_PENDING, IncidentStatus.CLOSED]:
        inc.resolved_at = datetime.now(timezone.utc)

    db.add(StatusHistory(
        entity_type="incident",
        entity_id=inc.id,
        previous_status=prev_status,
        new_status=inc.status,
        changed_by_user_id=current_user.id,
        actor_name=current_user.full_name,
        notes=payload.notes or f"Status transitioned to {payload.status}"
    ))

    # Notify contributing citizens
    status_display = payload.status.replace("_", " ")
    for link in inc.report_associations:
        if link.report.citizen_id:
            title_text = "Incident Resolved" if payload.status == IncidentStatus.CLOSED else "Incident Progress Update"
            msg_text = payload.public_update or f"Status updated to {status_display}"
            db.add(Notification(
                user_id=link.report.citizen_id,
                title=title_text,
                message=f"Incident #{inc.incident_number}: {msg_text}",
                type="success" if payload.status == IncidentStatus.CLOSED else "info",
                entity_type="incident",
                entity_id=inc.id,
                link=f"/citizen/my-reports"
            ))

    db.commit()
    return {"message": "Incident status updated", "status": inc.status}

@router.post("/{id}/notes")
def add_incident_notes(
    id: int,
    payload: IncidentNotesRequest,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found.")

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    if payload.is_internal:
        existing = inc.internal_notes or ""
        inc.internal_notes = f"{existing}\n[{timestamp} by {current_user.full_name}]: {payload.notes}".strip()
    else:
        inc.public_update = payload.notes

    db.commit()
    return {"message": "Notes updated successfully"}

@router.post("/{id}/merge")
def merge_incident(
    id: int,
    payload: IncidentMergeRequest,
    current_user: User = Depends(require_authority),
    db: Session = Depends(get_db)
):
    source_inc = db.query(Incident).filter(Incident.id == id).first()
    target_inc = db.query(Incident).filter(Incident.id == payload.target_incident_id).first()

    if not source_inc or not target_inc:
        raise HTTPException(status_code=404, detail="Source or target incident not found")
    if source_inc.id == target_inc.id:
        raise HTTPException(status_code=400, detail="Cannot merge incident into itself")

    # Transfer reports from source to target
    moved_count = 0
    for link in source_inc.report_associations:
        # Check if already linked to target
        existing = db.query(IncidentReport).filter(
            IncidentReport.incident_id == target_inc.id,
            IncidentReport.report_id == link.report_id
        ).first()
        if not existing:
            new_link = IncidentReport(
                incident_id=target_inc.id,
                report_id=link.report_id,
                similarity_score=link.similarity_score,
                distance_meters=link.distance_meters
            )
            db.add(new_link)
            moved_count += 1
        db.delete(link)

    target_inc.report_count += moved_count
    source_inc.status = IncidentStatus.MERGED
    source_inc.internal_notes = f"Merged into {target_inc.incident_number}. Reason: {payload.reason}"

    db.add(StatusHistory(
        entity_type="incident",
        entity_id=source_inc.id,
        previous_status=source_inc.status,
        new_status=IncidentStatus.MERGED,
        changed_by_user_id=current_user.id,
        actor_name=current_user.full_name,
        notes=f"Merged into {target_inc.incident_number}. Reason: {payload.reason}"
    ))

    db.add(AuditLog(
        user_id=current_user.id,
        action="INCIDENT_MERGED",
        entity_type="incident",
        entity_id=source_inc.id,
        details_json={"target_incident_id": target_inc.id, "reason": payload.reason}
    ))

    db.commit()
    return {"message": f"Successfully merged into {target_inc.incident_number}"}

from pydantic import BaseModel
from backend.app.services.prioritization_service import PrioritizationService

class PriorityOverridePayload(BaseModel):
    priority: str # critical, high, medium, low
    override_reason: str

@router.post("/{id}/priority-override")
def override_incident_priority(
    id: int,
    payload: PriorityOverridePayload,
    current_user: User = Depends(require_authority),
    db: Session = Depends(get_db)
):
    """
    Allows authorized civic officials to manually override AI-assigned priority with justification.
    """
    inc = db.query(Incident).filter(Incident.id == id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    old_priority = inc.priority
    old_score = inc.priority_score

    p_calc = PrioritizationService.calculate_priority(
        category_name=inc.category.name if inc.category else "Civic Issue",
        report_count=inc.report_count,
        unique_reporters=inc.unique_reporter_count,
        geographic_area=inc.geographic_area,
        created_at=inc.created_at,
        manual_override=True,
        override_band=payload.priority
    )

    inc.priority = p_calc["priority_band"]
    inc.priority_score = p_calc["priority_score"]
    inc.priority_breakdown = p_calc["breakdown"]
    inc.sla_due_date = p_calc["sla_due_date"]
    inc.manual_priority_override = True
    inc.override_reason = payload.override_reason

    # Add Status History
    db.add(StatusHistory(
        entity_type="incident",
        entity_id=inc.id,
        previous_status=inc.status,
        new_status=inc.status,
        changed_by_user_id=current_user.id,
        actor_name=current_user.full_name,
        notes=f"Priority manually overridden from {old_priority} to {inc.priority}. Reason: {payload.override_reason}"
    ))

    # Add Audit Log
    db.add(AuditLog(
        user_id=current_user.id,
        action="PRIORITY_MANUAL_OVERRIDE",
        entity_type="incident",
        entity_id=inc.id,
        details_json={
            "old_priority": old_priority,
            "new_priority": inc.priority,
            "old_score": old_score,
            "new_score": inc.priority_score,
            "reason": payload.override_reason
        }
    ))

    db.commit()
    return {
        "status": "success",
        "incident_id": inc.id,
        "priority": inc.priority,
        "priority_score": inc.priority_score,
        "sla_due_date": inc.sla_due_date.isoformat() if inc.sla_due_date else None,
        "message": "Incident priority successfully adjusted by authority."
    }
