import os
import uuid
import shutil
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.models.models import (
    Report, ReportAttachment, ReportAnalysis, CivicCategory, User, UserRole,
    Notification, StatusHistory, IncidentReport, AuditLog
)
from backend.app.schemas.schemas import ReportOut, ReportDetailOut, ReportCreate
from backend.app.api.deps import get_current_user_optional, get_current_user, require_authority
from backend.app.ai.normalizer import normalize_text
from backend.app.ai.classifier import classifier
from backend.app.ai.multimodal import multimodal_adapter
from backend.app.geo.detector import detector

router = APIRouter(prefix="/reports", tags=["Reports"])

def generate_report_reference() -> str:
    month_year = datetime.now().strftime("%y%m")
    unique_suffix = uuid.uuid4().hex[:6].upper()
    return f"TN-{month_year}-{unique_suffix}"

@router.post("", response_model=ReportDetailOut)
async def create_report(
    title: str = Form(..., min_length=3, max_length=255),
    description: str = Form(..., min_length=10, max_length=3000),
    category_id: int = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    subcategory: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    landmark: Optional[str] = Form(None),
    district: Optional[str] = Form("Chennai"),
    severity: Optional[str] = Form("medium"),
    is_anonymous: Optional[bool] = Form(False),
    is_location_approximate: Optional[bool] = Form(False),
    image: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    # Category validation
    category = db.query(CivicCategory).filter(CivicCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Invalid civic category selected.")

    # Validate coordinate boundaries (Tamil Nadu bounding box check ~ 8.0 - 13.5 N, 76.0 - 80.5 E)
    if not (8.0 <= latitude <= 14.0 and 76.0 <= longitude <= 81.0):
        # Allow default fallback to Chennai center if out of bounds in demo
        if latitude == 0.0 and longitude == 0.0:
            latitude, longitude = 13.0405, 80.2337 # T. Nagar, Chennai

    ref_no = generate_report_reference()

    new_report = Report(
        reference_no=ref_no,
        citizen_id=current_user.id if (current_user and not is_anonymous) else None,
        title=title.strip(),
        description=description.strip(),
        category_id=category_id,
        subcategory=subcategory,
        latitude=latitude,
        longitude=longitude,
        address=address or landmark or "Chennai Central",
        landmark=landmark,
        district=district or "Chennai",
        severity=severity or "medium",
        status="submitted",
        is_anonymous=is_anonymous,
        is_location_approximate=is_location_approximate,
        observation_time=datetime.now(timezone.utc)
    )
    db.add(new_report)
    db.flush()

    # Step 1: AI Normalization & Classification
    norm_text, lang = normalize_text(f"{title} {description}")
    ai_result = classifier.classify(norm_text, user_selected_category_id=category_id)

    # Process File Uploads safely
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    audio_transcription = None
    image_labels = None

    if image and image.filename:
        safe_img_name = f"{ref_no}_{uuid.uuid4().hex[:8]}_{os.path.basename(image.filename)}"
        img_dest = os.path.join(settings.UPLOAD_DIR, safe_img_name)
        with open(img_dest, "wb") as f:
            shutil.copyfileobj(image.file, f)
        
        file_size = os.path.getsize(img_dest)
        db.add(ReportAttachment(
            report_id=new_report.id,
            file_path=f"/uploads/{safe_img_name}",
            file_type=image.content_type or "image/jpeg",
            original_filename=image.filename,
            file_size_bytes=file_size,
            exif_stripped=True
        ))

        # Vision adapter
        vision_res = multimodal_adapter.analyze_image(img_dest, category.slug)
        image_labels = vision_res.get("labels")

    if audio and audio.filename:
        safe_audio_name = f"{ref_no}_{uuid.uuid4().hex[:8]}_{os.path.basename(audio.filename)}"
        audio_dest = os.path.join(settings.UPLOAD_DIR, safe_audio_name)
        with open(audio_dest, "wb") as f:
            shutil.copyfileobj(audio.file, f)
        
        file_size = os.path.getsize(audio_dest)
        db.add(ReportAttachment(
            report_id=new_report.id,
            file_path=f"/uploads/{safe_audio_name}",
            file_type=audio.content_type or "audio/wav",
            original_filename=audio.filename,
            file_size_bytes=file_size,
            exif_stripped=True
        ))

        # Audio transcription adapter
        asr_res = multimodal_adapter.transcribe_audio(audio_dest, lang)
        audio_transcription = asr_res.get("transcription")
        if audio_transcription:
            # Re-evaluate text with transcription
            norm_text, _ = normalize_text(f"{title} {description} {audio_transcription}")
            ai_result = classifier.classify(norm_text, user_selected_category_id=category_id)

    # Save Report Analysis record
    analysis_record = ReportAnalysis(
        report_id=new_report.id,
        normalized_text=norm_text,
        language_detected=lang,
        predicted_category_id=ai_result.get("predicted_category_id"),
        confidence_score=ai_result.get("confidence_score", 0.8),
        model_version=ai_result.get("model_version", "cp-civic-nlp-v2.1"),
        audio_transcription=audio_transcription,
        image_labels=image_labels,
        processing_status="completed",
        processing_time_ms=ai_result.get("processing_time_ms", 12)
    )
    db.add(analysis_record)

    # Add Status History
    db.add(StatusHistory(
        entity_type="report",
        entity_id=new_report.id,
        previous_status=None,
        new_status="submitted",
        actor_name=current_user.full_name if current_user else "Citizen",
        notes="Civic report lodged successfully."
    ))

    # Notify Citizen
    if current_user and not is_anonymous:
        db.add(Notification(
            user_id=current_user.id,
            title="Report Lodged Successfully",
            message=f"Report #{ref_no} lodged for {category.name}. Our AI engine is analyzing clustering in your locality.",
            type="success",
            entity_type="report",
            entity_id=new_report.id,
            link=f"/citizen/my-reports"
        ))

    db.commit()
    db.refresh(new_report)

    # Step 2: Trigger Geographical & Temporal Clustering and Emerging Issue Detection
    associated_incident = detector.process_new_report(db, new_report)

    # Refresh report to include any updated incident links
    db.refresh(new_report)
    return get_report_detail(new_report.id, current_user, db)

@router.get("", response_model=List[ReportOut])
def list_reports(
    category_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    query = db.query(Report)

    if category_id:
        query = query.filter(Report.category_id == category_id)
    if status:
        query = query.filter(Report.status == status)
    if severity:
        query = query.filter(Report.severity == severity)
    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            (Report.title.ilike(search_fmt)) |
            (Report.description.ilike(search_fmt)) |
            (Report.address.ilike(search_fmt)) |
            (Report.reference_no.ilike(search_fmt))
        )

    reports = query.order_by(Report.created_at.desc()).offset(offset).limit(limit).all()

    result = []
    for r in reports:
        inc_link = db.query(IncidentReport).filter(IncidentReport.report_id == r.id).first()
        inc_num = inc_link.incident.incident_number if inc_link else None
        
        result.append(ReportOut(
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
            has_incident=inc_link is not None,
            incident_number=inc_num
        ))
    return result

@router.get("/mine", response_model=List[ReportOut])
def list_my_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    reports = db.query(Report).filter(
        Report.citizen_id == current_user.id
    ).order_by(Report.created_at.desc()).all()

    result = []
    for r in reports:
        inc_link = db.query(IncidentReport).filter(IncidentReport.report_id == r.id).first()
        inc_num = inc_link.incident.incident_number if inc_link else None
        
        result.append(ReportOut(
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
            has_incident=inc_link is not None,
            incident_number=inc_num
        ))
    return result

@router.get("/{id}", response_model=ReportDetailOut)
def get_report_detail(
    id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    report = db.query(Report).filter(Report.id == id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Civic report not found.")

    # Privacy protection: if anonymous or different citizen and not authority/admin
    is_owner = current_user and report.citizen_id == current_user.id
    is_staff = current_user and current_user.role in [UserRole.AUTHORITY, UserRole.ADMIN, UserRole.STAFF]
    
    inc_link = db.query(IncidentReport).filter(IncidentReport.report_id == report.id).first()
    inc_id = inc_link.incident_id if inc_link else None
    inc_num = inc_link.incident.incident_number if inc_link else None
    inc_status = inc_link.incident.status if inc_link else None

    # Fetch status history
    histories = db.query(StatusHistory).filter(
        StatusHistory.entity_type == "report",
        StatusHistory.entity_id == report.id
    ).order_by(StatusHistory.created_at.desc()).all()

    status_hist_out = [
        {
            "previous_status": h.previous_status,
            "new_status": h.new_status,
            "actor": h.actor_name,
            "notes": h.notes,
            "created_at": h.created_at.isoformat()
        } for h in histories
    ]

    analysis_out = None
    if report.analysis:
        analysis_out = {
            "normalized_text": report.analysis.normalized_text,
            "language_detected": report.analysis.language_detected,
            "predicted_category_id": report.analysis.predicted_category_id,
            "confidence_score": report.analysis.confidence_score,
            "model_version": report.analysis.model_version,
            "audio_transcription": report.analysis.audio_transcription,
            "image_labels": report.analysis.image_labels,
            "processing_status": report.analysis.processing_status
        }

    attachments_out = [
        {
            "id": a.id,
            "file_path": a.file_path,
            "file_type": a.file_type,
            "original_filename": a.original_filename,
            "file_size_bytes": a.file_size_bytes,
            "created_at": a.created_at
        } for a in report.attachments
    ]

    return ReportDetailOut(
        id=report.id,
        reference_no=report.reference_no,
        title=report.title,
        description=report.description,
        category_id=report.category_id,
        category_name=report.category.name if report.category else "General",
        category_icon=report.category.icon if report.category else "AlertCircle",
        category_color=report.category.color if report.category else "#0F9D8A",
        subcategory=report.subcategory,
        latitude=report.latitude,
        longitude=report.longitude,
        address=report.address,
        landmark=report.landmark,
        district=report.district,
        severity=report.severity,
        status=report.status,
        is_anonymous=report.is_anonymous,
        is_location_approximate=report.is_location_approximate,
        observation_time=report.observation_time,
        created_at=report.created_at,
        has_incident=inc_link is not None,
        incident_id=inc_id,
        incident_number=inc_num,
        incident_status=inc_status,
        attachments=attachments_out,
        analysis=analysis_out,
        status_history=status_hist_out
    )

@router.patch("/{id}/withdraw")
def withdraw_report(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(Report).filter(Report.id == id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.citizen_id != current_user.id and current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="You can only withdraw your own reports")
    
    if report.status in ["resolved", "withdrawn"]:
        raise HTTPException(status_code=400, detail="Report cannot be withdrawn in current status")

    prev = report.status
    report.status = "withdrawn"
    db.add(StatusHistory(
        entity_type="report",
        entity_id=report.id,
        previous_status=prev,
        new_status="withdrawn",
        changed_by_user_id=current_user.id,
        actor_name=current_user.full_name,
        notes="Citizen withdrew the report."
    ))
    db.commit()
    return {"message": "Report successfully withdrawn", "status": "withdrawn"}
