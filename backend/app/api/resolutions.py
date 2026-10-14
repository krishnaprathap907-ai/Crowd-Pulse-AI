from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from backend.app.core.database import get_db, utcnow
from backend.app.api.deps import get_current_user, get_optional_current_user
from backend.app.models.models import (
    Incident, IncidentResolutionEvidence, StatusHistory, Notification, User, IncidentStatus, Report
)

router = APIRouter(prefix="", tags=["Resolutions & Verification"])

class ResolutionSubmitRequest(BaseModel):
    work_completion_notes: str
    before_image_url: Optional[str] = None
    after_image_url: Optional[str] = None

class CitizenFeedbackRequest(BaseModel):
    citizen_confirmation_rating: int # 1 to 5
    citizen_feedback_text: Optional[str] = None
    reopen_incident: bool = False
    reopen_reason: Optional[str] = None

@router.post("/incidents/{incident_id}/resolution")
def submit_resolution_evidence(
    incident_id: int,
    payload: ResolutionSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Authority/Field Staff submits completed work evidence with before and after photographs.
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    evidence = IncidentResolutionEvidence(
        incident_id=incident.id,
        submitted_by_user_id=current_user.id,
        before_image_url=payload.before_image_url or "/static/images/evidence_default.jpg",
        after_image_url=payload.after_image_url or "/static/images/resolved_default.jpg",
        work_completion_notes=payload.work_completion_notes,
        created_at=utcnow()
    )
    db.add(evidence)

    # Transition Incident to RESOLVED
    prev_status = incident.status
    incident.status = IncidentStatus.RESOLVED
    incident.resolved_at = utcnow()
    incident.resolution_notes = payload.work_completion_notes
    incident.resolution_evidence_url = payload.after_image_url

    # Add history
    db.add(StatusHistory(
        entity_type="incident",
        entity_id=incident.id,
        previous_status=prev_status,
        new_status=IncidentStatus.RESOLVED,
        actor_name=current_user.full_name or "Department Officer",
        notes=f"Resolution work logged with verification evidence: {payload.work_completion_notes}"
    ))

    # Mark associated reports as resolved and notify citizens
    for assoc in incident.report_associations:
        rep = assoc.report
        if rep:
            rep.status = "resolved"
            if rep.user_id:
                db.add(Notification(
                    user_id=rep.user_id,
                    title="Civic Issue Resolved!",
                    message=f"Work has been completed for your reported issue in #{incident.incident_number}. Please verify and rate the resolution.",
                    type="success",
                    entity_type="incident",
                    entity_id=incident.id,
                    link="/citizen/my-reports"
                ))

    db.commit()
    db.refresh(evidence)

    return {
        "status": "success",
        "evidence_id": evidence.id,
        "incident_status": incident.status,
        "message": "Resolution verified and submitted for citizen confirmation."
    }

@router.post("/incidents/{incident_id}/feedback")
@router.post("/resolutions/{incident_id}/feedback")
def submit_citizen_feedback(
    incident_id: int,
    payload: CitizenFeedbackRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Citizen rates resolution quality (1-5 stars) or requests reopening if problem persists.
    """
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    evidence = db.query(IncidentResolutionEvidence).filter(
        IncidentResolutionEvidence.incident_id == incident_id
    ).order_by(IncidentResolutionEvidence.created_at.desc()).first()

    if not evidence:
        evidence = IncidentResolutionEvidence(
            incident_id=incident_id,
            submitted_by_user_id=current_user.id if current_user else 1,
            work_completion_notes="Initial field completion",
            created_at=utcnow()
        )
        db.add(evidence)
        db.flush()

    evidence.citizen_confirmation_rating = payload.citizen_confirmation_rating
    evidence.citizen_feedback_text = payload.citizen_feedback_text

    if payload.reopen_incident:
        evidence.is_reopened = True
        evidence.reopen_reason = payload.reopen_reason or "Citizen reported incomplete remediation"
        
        # Transition back to in_progress or investigating
        incident.status = IncidentStatus.INVESTIGATING
        incident.priority = "high"
        
        db.add(StatusHistory(
            entity_type="incident",
            entity_id=incident.id,
            previous_status=IncidentStatus.RESOLVED,
            new_status=IncidentStatus.INVESTIGATING,
            actor_name=current_user.full_name if current_user else "Citizen Reviewer",
            notes=f"Reopened by citizen: {evidence.reopen_reason}"
        ))

    db.commit()

    return {
        "status": "success",
        "reopened": payload.reopen_incident,
        "rating": payload.citizen_confirmation_rating,
        "message": "Citizen verification feedback recorded."
    }

@router.get("/incidents/{incident_id}/resolution")
def get_incident_resolution(
    incident_id: int,
    db: Session = Depends(get_db)
):
    """
    Returns resolution evidence for an incident.
    """
    evidence = db.query(IncidentResolutionEvidence).filter(
        IncidentResolutionEvidence.incident_id == incident_id
    ).order_by(IncidentResolutionEvidence.created_at.desc()).first()

    if not evidence:
        return {"has_evidence": False, "evidence": None}

    return {
        "has_evidence": True,
        "evidence": {
            "id": evidence.id,
            "incident_id": evidence.incident_id,
            "before_image_url": evidence.before_image_url,
            "after_image_url": evidence.after_image_url,
            "work_completion_notes": evidence.work_completion_notes,
            "citizen_confirmation_rating": evidence.citizen_confirmation_rating,
            "citizen_feedback_text": evidence.citizen_feedback_text,
            "is_reopened": evidence.is_reopened,
            "reopen_reason": evidence.reopen_reason,
            "created_at": evidence.created_at.isoformat() if evidence.created_at else None
        }
    }

@router.get("/resolutions/recent")
def get_recent_resolutions(
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    Returns recent verified resolutions with photographic evidence across Tamil Nadu.
    """
    evidences = db.query(IncidentResolutionEvidence).order_by(
        IncidentResolutionEvidence.created_at.desc()
    ).limit(limit).all()

    results = []
    for ev in evidences:
        inc = ev.incident
        results.append({
            "id": ev.id,
            "incident_id": ev.incident_id,
            "incident_number": inc.incident_number if inc else f"INC-{ev.incident_id}",
            "title": inc.title if inc else "Civic Remediation",
            "geographic_area": inc.geographic_area if inc else "Tamil Nadu",
            "category_name": inc.category.name if inc and inc.category else "Municipal Service",
            "before_image_url": ev.before_image_url,
            "after_image_url": ev.after_image_url,
            "work_completion_notes": ev.work_completion_notes,
            "citizen_rating": ev.citizen_confirmation_rating or 5,
            "resolved_at": ev.created_at.isoformat() if ev.created_at else None
        })

    return {"count": len(results), "resolutions": results}
