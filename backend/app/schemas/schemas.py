from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# User & Auth
class UserRegister(BaseModel):
    email: str
    full_name: str
    password: str
    phone: Optional[str] = None
    role: Optional[str] = "citizen"
    neighborhood: Optional[str] = None
    preferred_language: Optional[str] = "en"

class UserLogin(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ForgotPasswordReset(BaseModel):
    email: str
    otp: str
    new_password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

class UserProfileOut(BaseModel):
    preferred_language: str
    neighborhood: Optional[str]
    district: str
    avatar_url: Optional[str]

    class Config:
        from_attributes = True

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    phone: Optional[str]
    is_active: bool
    created_at: datetime
    profile: Optional[UserProfileOut] = None

    class Config:
        from_attributes = True

# Category
class CategoryOut(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str]
    icon: str
    color: str
    default_priority: str

    class Config:
        from_attributes = True

# Department
class DepartmentOut(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    contact_email: Optional[str]

    class Config:
        from_attributes = True

# Report Attachment
class ReportAttachmentOut(BaseModel):
    id: int
    file_path: str
    file_type: str
    original_filename: str
    file_size_bytes: int
    created_at: datetime

    class Config:
        from_attributes = True

# Report Analysis
class ReportAnalysisOut(BaseModel):
    normalized_text: str
    language_detected: str
    predicted_category_id: Optional[int]
    confidence_score: float
    model_version: str
    audio_transcription: Optional[str] = None
    image_labels: Optional[Any] = None
    processing_status: str
    english_translation: Optional[str] = None
    summary: Optional[str] = None
    entities_extracted: Optional[Any] = None
    pii_flagged: Optional[bool] = False
    pii_redacted_text: Optional[str] = None
    severity_score: Optional[float] = 0.5
    image_perceptual_hash: Optional[str] = None

    class Config:
        from_attributes = True

# Report
class ReportCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=10, max_length=3000)
    category_id: int
    subcategory: Optional[str] = None
    latitude: float
    longitude: float
    address: Optional[str] = None
    landmark: Optional[str] = None
    district: Optional[str] = "Chennai"
    severity: Optional[str] = "medium"
    is_anonymous: Optional[bool] = False
    observation_time: Optional[datetime] = None
    is_location_approximate: Optional[bool] = False

class ReportOut(BaseModel):
    id: int
    reference_no: str
    title: str
    description: str
    category_id: int
    category_name: Optional[str] = None
    category_icon: Optional[str] = None
    category_color: Optional[str] = None
    latitude: float
    longitude: float
    address: Optional[str]
    landmark: Optional[str]
    district: str
    severity: str
    status: str
    created_at: datetime
    has_incident: bool = False
    incident_number: Optional[str] = None

    class Config:
        from_attributes = True

class ReportDetailOut(ReportOut):
    subcategory: Optional[str]
    is_anonymous: bool
    is_location_approximate: bool
    observation_time: datetime
    attachments: List[ReportAttachmentOut] = []
    analysis: Optional[ReportAnalysisOut] = None
    incident_id: Optional[int] = None
    incident_status: Optional[str] = None
    status_history: List[Dict[str, Any]] = []
    assigned_department_name: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    resolution_evidence_url: Optional[str] = None
    public_update: Optional[str] = None
    sla_due_date: Optional[datetime] = None

# Incident
class IncidentOut(BaseModel):
    id: int
    incident_number: str
    title: str
    category_id: int
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    category_icon: Optional[str] = None
    description: str
    geographic_area: str
    district: str
    center_latitude: float
    center_longitude: float
    radius_meters: float
    status: str
    priority: str
    priority_score: Optional[float] = 50.0
    sla_due_date: Optional[datetime] = None
    is_overdue: Optional[bool] = False
    report_count: int
    unique_reporter_count: int
    first_reported_at: datetime
    latest_activity_at: datetime
    assigned_department_id: Optional[int] = None
    assigned_department_name: Optional[str] = None
    assigned_staff_name: Optional[str] = None
    resolution_evidence_url: Optional[str] = None
    is_demo: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

class IncidentDetailOut(IncidentOut):
    detection_reason: str
    evidence_summary: Dict[str, Any]
    priority_breakdown: Optional[Dict[str, Any]] = None
    match_signals_breakdown: Optional[Dict[str, Any]] = None
    public_update: Optional[str] = None
    internal_notes: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolution_evidence_url: Optional[str] = None
    resolved_at: Optional[datetime] = None
    reports: List[ReportOut] = []
    status_history: List[Dict[str, Any]] = []

class IncidentVerifyRequest(BaseModel):
    verified: bool # True = verify, False = reject
    priority: Optional[str] = None
    notes: Optional[str] = None

class IncidentAssignRequest(BaseModel):
    department_id: int
    staff_id: Optional[int] = None
    notes: Optional[str] = None
    priority: Optional[str] = None

class IncidentStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None
    public_update: Optional[str] = None
    resolution_notes: Optional[str] = None

class IncidentMergeRequest(BaseModel):
    target_incident_id: int
    reason: str

class IncidentNotesRequest(BaseModel):
    notes: str
    is_internal: bool = True

# Notification
class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    type: str
    entity_type: Optional[str]
    entity_id: Optional[int]
    link: Optional[str]
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Analytics
class OverviewMetrics(BaseModel):
    total_reports: int
    new_reports_today: int
    active_incidents: int
    candidates_awaiting_review: int
    high_priority_incidents: int
    resolved_incidents: int
    avg_resolution_hours: float
    cluster_reduction_rate: float # e.g. % complaints consolidated

class TrendPoint(BaseModel):
    date: str
    reports: int
    incidents_detected: int

class CategoryBreakdown(BaseModel):
    category_id: int
    name: str
    count: int
    color: str
    percentage: float

class HotspotArea(BaseModel):
    area: str
    report_count: int
    incident_count: int
    primary_category: str
    latitude: float
    longitude: float

# Map
class MapReportPoint(BaseModel):
    id: int
    reference_no: str
    title: str
    category_name: str
    category_color: str
    latitude: float
    longitude: float
    status: str
    severity: str
    created_at: datetime
    incident_id: Optional[int] = None

class MapIncidentPoint(BaseModel):
    id: int
    incident_number: str
    title: str
    category_name: str
    category_color: str
    latitude: float
    longitude: float
    radius_meters: float
    status: str
    priority: str
    report_count: int
    area: str
    is_candidate: bool
    created_at: datetime
