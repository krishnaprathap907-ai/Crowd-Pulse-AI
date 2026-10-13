from datetime import datetime, timezone
import uuid
from sqlalchemy import (
    Column, Integer, String, Float, Text, Boolean, DateTime, ForeignKey, Enum, JSON
)
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class UserRole:
    CITIZEN = "citizen"
    AUTHORITY = "authority"
    STAFF = "staff"
    ADMIN = "admin"

class IncidentStatus:
    CANDIDATE = "candidate"
    UNDER_REVIEW = "under_review"
    VERIFIED = "verified"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    RESOLVED_PENDING = "resolved_pending"
    CLOSED = "closed"
    REJECTED = "rejected"
    MERGED = "merged"

class PriorityLevel:
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default=UserRole.CITIZEN, nullable=False)
    phone = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    profile = relationship("UserProfile", back_populates="user", uselist=False)
    reports = relationship("Report", back_populates="citizen")
    notifications = relationship("Notification", back_populates="user")

class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    preferred_language = Column(String(20), default="en") # "en" or "ta"
    neighborhood = Column(String(255), nullable=True)
    district = Column(String(255), default="Chennai")
    notification_preferences = Column(JSON, default=lambda: {"email": True, "app": True})
    avatar_url = Column(String(255), nullable=True)

    user = relationship("User", back_populates="profile")

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    contact_email = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)

    incidents = relationship("Incident", back_populates="assigned_department")

class CivicCategory(Base):
    __tablename__ = "civic_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), default="AlertCircle")
    color = Column(String(20), default="#0F9D8A")
    default_priority = Column(String(20), default=PriorityLevel.MEDIUM)
    is_active = Column(Boolean, default=True)

    reports = relationship("Report", back_populates="category")
    incidents = relationship("Incident", back_populates="category")

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    reference_no = Column(String(50), unique=True, index=True, nullable=False)
    citizen_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category_id = Column(Integer, ForeignKey("civic_categories.id"), nullable=False)
    subcategory = Column(String(100), nullable=True)
    
    # Location
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String(255), nullable=True)
    landmark = Column(String(255), nullable=True)
    district = Column(String(100), default="Chennai")
    is_location_approximate = Column(Boolean, default=False)
    
    # Details
    observation_time = Column(DateTime, default=utcnow)
    severity = Column(String(20), default=PriorityLevel.MEDIUM)
    status = Column(String(50), default="submitted") # submitted, analyzing, clustered, linked_to_incident, resolved, withdrawn
    is_anonymous = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    citizen = relationship("User", back_populates="reports")
    category = relationship("CivicCategory", back_populates="reports")
    attachments = relationship("ReportAttachment", back_populates="report", cascade="all, delete-orphan")
    analysis = relationship("ReportAnalysis", back_populates="report", uselist=False, cascade="all, delete-orphan")
    incident_associations = relationship("IncidentReport", back_populates="report")

class ReportAttachment(Base):
    __tablename__ = "report_attachments"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False) # "image/jpeg", "audio/wav", etc.
    original_filename = Column(String(255), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    exif_stripped = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    report = relationship("Report", back_populates="attachments")

class ReportAnalysis(Base):
    __tablename__ = "report_analysis"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), unique=True, nullable=False)
    normalized_text = Column(Text, nullable=False)
    language_detected = Column(String(20), default="en")
    predicted_category_id = Column(Integer, ForeignKey("civic_categories.id"), nullable=True)
    confidence_score = Column(Float, default=0.0)
    model_version = Column(String(50), default="cp-nlp-tfidf-v1")
    audio_transcription = Column(Text, nullable=True)
    image_labels = Column(JSON, nullable=True)
    processing_status = Column(String(50), default="completed") # pending, processing, completed, failed
    processing_time_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)

    report = relationship("Report", back_populates="analysis")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    incident_number = Column(String(50), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    category_id = Column(Integer, ForeignKey("civic_categories.id"), nullable=False)
    description = Column(Text, nullable=False)
    
    # Spatial info
    geographic_area = Column(String(255), nullable=False) # e.g., "T. Nagar - Ward 117"
    district = Column(String(100), default="Chennai")
    center_latitude = Column(Float, nullable=False)
    center_longitude = Column(Float, nullable=False)
    radius_meters = Column(Float, default=300.0)
    
    # Workflow status
    status = Column(String(50), default=IncidentStatus.CANDIDATE, index=True)
    priority = Column(String(20), default=PriorityLevel.MEDIUM)
    is_demo = Column(Boolean, default=False)
    
    # Evidence & Explainability
    detection_reason = Column(Text, nullable=False)
    evidence_summary = Column(JSON, nullable=False) # Details of cluster, distance, times, reporters
    report_count = Column(Integer, default=1)
    unique_reporter_count = Column(Integer, default=1)
    first_reported_at = Column(DateTime, default=utcnow)
    latest_activity_at = Column(DateTime, default=utcnow)
    
    # Assignment & Resolution
    assigned_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    assigned_staff_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    public_update = Column(Text, nullable=True)
    internal_notes = Column(Text, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    resolution_evidence_url = Column(String(500), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    category = relationship("CivicCategory", back_populates="incidents")
    assigned_department = relationship("Department", back_populates="incidents")
    report_associations = relationship("IncidentReport", back_populates="incident", cascade="all, delete-orphan")
    assignments = relationship("IncidentAssignment", back_populates="incident", cascade="all, delete-orphan")
    alerts = relationship("AlertEvent", back_populates="incident", cascade="all, delete-orphan")

class IncidentReport(Base):
    __tablename__ = "incident_reports"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    similarity_score = Column(Float, default=1.0)
    distance_meters = Column(Float, default=0.0)
    added_at = Column(DateTime, default=utcnow)

    incident = relationship("Incident", back_populates="report_associations")
    report = relationship("Report", back_populates="incident_associations")

class IncidentAssignment(Base):
    __tablename__ = "incident_assignments"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    assigned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(50), default="assigned")
    created_at = Column(DateTime, default=utcnow)

    incident = relationship("Incident", back_populates="assignments")

class StatusHistory(Base):
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String(50), nullable=False) # "incident" or "report"
    entity_id = Column(Integer, nullable=False)
    previous_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=False)
    changed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(255), default="System")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="info") # info, alert, success, warning
    entity_type = Column(String(50), nullable=True) # "report" or "incident"
    entity_id = Column(Integer, nullable=True)
    link = Column(String(255), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="notifications")

class AlertEvent(Base):
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False)
    alert_level = Column(String(50), default="emerging_issue")
    trigger_rule = Column(String(255), nullable=False)
    evidence_json = Column(JSON, nullable=False)
    cooldown_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    incident = relationship("Incident", back_populates="alerts")

class ModelVersion(Base):
    __tablename__ = "model_versions"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(100), nullable=False)
    version = Column(String(50), nullable=False)
    accuracy_score = Column(Float, default=0.92)
    is_active = Column(Boolean, default=True)
    deployed_at = Column(DateTime, default=utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=True)
    ip_address = Column(String(50), default="127.0.0.1")
    details_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow)

class ApplicationSetting(Base):
    __tablename__ = "application_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(String(500), nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
