from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import uuid
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.models import (
    Report, Incident, IncidentReport, AlertEvent, Notification, StatusHistory,
    CivicCategory, User, UserRole, IncidentStatus, PriorityLevel
)
from backend.app.geo.clustering import haversine_distance, calculate_centroid_and_radius
from backend.app.geo.temporal import filter_reports_by_time_window, calculate_arrival_rate
from backend.app.ai.similarity import similarity_engine

class EmergingIssueDetector:
    """
    Dedicated Civic Incident Detection Service.
    Combines text semantics, spatial distance, and temporal rolling windows
    to detect emerging collective incidents with transparent explainability.
    """

    def process_new_report(self, db: Session, new_report: Report) -> Optional[Incident]:
        """
        Evaluates a newly submitted report against active incidents and unclustered reports.
        """
        # Step 1: Check existing active incidents for potential match
        matching_incident = self._find_matching_active_incident(db, new_report)
        if matching_incident:
            self._attach_report_to_incident(db, matching_incident, new_report)
            return matching_incident

        # Step 2: Check candidate cluster among unassigned recent reports
        return self._evaluate_new_cluster(db, new_report)

    def _find_matching_active_incident(self, db: Session, report: Report) -> Optional[Incident]:
        """
        Checks if report matches an ongoing active incident within category and spatial radius.
        """
        active_statuses = [
            IncidentStatus.CANDIDATE, IncidentStatus.UNDER_REVIEW,
            IncidentStatus.VERIFIED, IncidentStatus.ASSIGNED, IncidentStatus.IN_PROGRESS
        ]
        active_incidents = db.query(Incident).filter(
            Incident.category_id == report.category_id,
            Incident.status.in_(active_statuses)
        ).all()

        for inc in active_incidents:
            dist = haversine_distance(
                report.latitude, report.longitude,
                inc.center_latitude, inc.center_longitude
            )
            # Match within incident radius + 200m buffer
            allowed_dist = max(settings.DETECTION_DISTANCE_METERS, inc.radius_meters + 200.0)
            if dist <= allowed_dist:
                sim = similarity_engine.compute_similarity(report.description, inc.description)
                if sim >= 0.25: # Reasonable semantic compatibility
                    return inc

        return None

    def _attach_report_to_incident(self, db: Session, incident: Incident, report: Report):
        """
        Attaches report to existing incident, updates count, centroid, evidence, and notifies citizen.
        """
        # Check if already linked
        existing_link = db.query(IncidentReport).filter(
            IncidentReport.incident_id == incident.id,
            IncidentReport.report_id == report.id
        ).first()
        if existing_link:
            return

        dist = haversine_distance(
            report.latitude, report.longitude,
            incident.center_latitude, incident.center_longitude
        )
        sim = similarity_engine.compute_similarity(report.description, incident.description)

        link = IncidentReport(
            incident_id=incident.id,
            report_id=report.id,
            similarity_score=sim,
            distance_meters=round(dist, 1)
        )
        db.add(link)

        # Update incident stats
        incident.report_count += 1
        incident.latest_activity_at = datetime.now(timezone.utc)
        
        # Check unique reporters
        reporter_ids = {r.report.citizen_id for r in incident.report_associations if r.report.citizen_id}
        if report.citizen_id:
            reporter_ids.add(report.citizen_id)
        incident.unique_reporter_count = max(len(reporter_ids), 1)

        # Update evidence summary
        evidence = dict(incident.evidence_summary or {})
        evidence["last_escalation_reason"] = f"New report {report.reference_no} added within {round(dist)}m"
        evidence["report_count"] = incident.report_count
        evidence["unique_reporter_count"] = incident.unique_reporter_count
        incident.evidence_summary = evidence

        # Escalate priority if reports grow significantly
        if incident.report_count >= 8 and incident.priority != PriorityLevel.CRITICAL:
            incident.priority = PriorityLevel.HIGH
        if incident.report_count >= 15:
            incident.priority = PriorityLevel.CRITICAL

        report.status = "linked_to_incident"

        # Notify citizen
        if report.citizen_id:
            db.add(Notification(
                user_id=report.citizen_id,
                title="Report Linked to Collective Incident",
                message=f"Your report #{report.reference_no} has been consolidated into active incident #{incident.incident_number}.",
                type="info",
                entity_type="incident",
                entity_id=incident.id,
                link=f"/citizen/my-reports"
            ))

        db.commit()

    def _evaluate_new_cluster(self, db: Session, new_report: Report) -> Optional[Incident]:
        """
        Scans for nearby recent unassigned reports in the same category to form a new incident.
        """
        time_cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.DETECTION_TIME_WINDOW_MINUTES)
        
        # Fetch candidate reports in same category
        candidates = db.query(Report).filter(
            Report.category_id == new_report.category_id,
            Report.created_at >= time_cutoff,
            Report.status.in_(["submitted", "analyzing", "clustered"])
        ).all()

        nearby_reports = []
        for r in candidates:
            dist = haversine_distance(new_report.latitude, new_report.longitude, r.latitude, r.longitude)
            if dist <= settings.DETECTION_DISTANCE_METERS:
                sim = similarity_engine.compute_similarity(new_report.description, r.description)
                if sim >= settings.DETECTION_SIMILARITY_THRESHOLD or dist <= 250.0:
                    nearby_reports.append((r, dist, sim))

        # Check required thresholds
        min_reports = settings.DETECTION_MIN_WATER_REPORTS if new_report.category_id == 1 else settings.DETECTION_MIN_REPORTS_DEFAULT
        min_unique_reporters = settings.DETECTION_MIN_UNIQUE_REPORTERS

        if len(nearby_reports) < min_reports:
            # Mark report as analyzed/clustered
            new_report.status = "analyzing"
            db.commit()
            return None

        # Count unique reporters
        unique_reporters = {r[0].citizen_id for r in nearby_reports if r[0].citizen_id}
        if len(unique_reporters) < min_unique_reporters and len(nearby_reports) < (min_reports + 1):
            return None

        # Thresholds satisfied! Create Candidate Incident
        points = [(r[0].latitude, r[0].longitude) for r in nearby_reports]
        c_lat, c_lon, radius = calculate_centroid_and_radius(points)

        # Determine area and title
        category = db.query(CivicCategory).filter(CivicCategory.id == new_report.category_id).first()
        cat_name = category.name if category else "Civic Issue"
        area_name = new_report.address or new_report.landmark or f"{new_report.district} Cluster"

        inc_num = f"INC-{datetime.now().strftime('%Y%m')}-{uuid.uuid4().hex[:5].upper()}"
        
        # Calculate time span
        times = [r[0].created_at for r in nearby_reports if r[0].created_at]
        times.sort()
        time_span_minutes = round((times[-1] - times[0]).total_seconds() / 60.0, 1) if len(times) > 1 else 0

        avg_similarity = round(sum(r[2] for r in nearby_reports) / len(nearby_reports), 3)

        evidence_summary = {
            "detection_algorithm": "DBSCAN-Spatial-Temporal-TFIDF-v2",
            "trigger_timestamp": datetime.now(timezone.utc).isoformat(),
            "time_window_minutes": settings.DETECTION_TIME_WINDOW_MINUTES,
            "actual_time_span_minutes": time_span_minutes,
            "total_reports_supporting": len(nearby_reports),
            "distinct_reporters": max(len(unique_reporters), 1),
            "affected_radius_meters": radius,
            "average_semantic_similarity": avg_similarity,
            "affected_streets_landmarks": list(set([r[0].landmark or r[0].address for r in nearby_reports if r[0].landmark or r[0].address]))[:6],
            "arrival_rate_per_hour": calculate_arrival_rate([{"created_at": t} for t in times]),
            "uncertainty_notes": "Identified automatically from collective citizen complaint burst. Physical inspection required by department to verify pipeline or infrastructure failure."
        }

        detection_reason = (
            f"Detected emerging {cat_name.lower()} incident based on {len(nearby_reports)} reports "
            f"from {max(len(unique_reporters), 1)} unique citizens within {radius:.0f}m radius "
            f"over {time_span_minutes} minutes in {area_name}."
        )

        incident = Incident(
            incident_number=inc_num,
            title=f"Emerging {cat_name} in {area_name}",
            category_id=new_report.category_id,
            description=f"Collective incident detected: Multiple citizens reporting {cat_name.lower()} concerns across {area_name}.",
            geographic_area=area_name,
            district=new_report.district or "Chennai",
            center_latitude=c_lat,
            center_longitude=c_lon,
            radius_meters=radius,
            status=IncidentStatus.CANDIDATE,
            priority=PriorityLevel.HIGH if len(nearby_reports) >= 5 else PriorityLevel.MEDIUM,
            detection_reason=detection_reason,
            evidence_summary=evidence_summary,
            report_count=len(nearby_reports),
            unique_reporter_count=max(len(unique_reporters), 1),
            first_reported_at=times[0] if times else datetime.now(timezone.utc),
            latest_activity_at=times[-1] if times else datetime.now(timezone.utc),
            is_demo=False
        )
        db.add(incident)
        db.flush() # Populate incident.id

        # Associate reports
        for rep, dist, sim in nearby_reports:
            link = IncidentReport(
                incident_id=incident.id,
                report_id=rep.id,
                similarity_score=sim,
                distance_meters=round(dist, 1)
            )
            db.add(link)
            rep.status = "linked_to_incident"

        # Add Status History
        db.add(StatusHistory(
            entity_type="incident",
            entity_id=incident.id,
            previous_status=None,
            new_status=IncidentStatus.CANDIDATE,
            actor_name="AI Detection Engine",
            notes=detection_reason
        ))

        # Add Alert Event
        db.add(AlertEvent(
            incident_id=incident.id,
            alert_level="emerging_candidate",
            trigger_rule=f"MIN_{cat_name.upper().replace(' ', '_')}_CLUSTER_EXCEEDED",
            evidence_json=evidence_summary,
            cooldown_until=datetime.now(timezone.utc) + timedelta(minutes=60)
        ))

        # Notify Authority Officers
        authorities = db.query(User).filter(User.role.in_([UserRole.AUTHORITY, UserRole.ADMIN])).all()
        for auth in authorities:
            db.add(Notification(
                user_id=auth.id,
                title=f"🚨 Candidate Incident Alert: {cat_name}",
                message=f"{incident.title} ({len(nearby_reports)} reports). Requires authority review & verification.",
                type="alert",
                entity_type="incident",
                entity_id=incident.id,
                link=f"/authority/incidents/{incident.id}"
            ))

        db.commit()
        db.refresh(incident)
        return incident

detector = EmergingIssueDetector()
