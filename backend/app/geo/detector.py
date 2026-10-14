from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import uuid
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.models import (
    Report, Incident, IncidentReport, AlertEvent, Notification, StatusHistory,
    CivicCategory, User, UserRole, IncidentStatus, PriorityLevel, ReportAnalysis
)
from backend.app.geo.clustering import haversine_distance, calculate_centroid_and_radius
from backend.app.geo.temporal import filter_reports_by_time_window, calculate_arrival_rate
from backend.app.ai.similarity import similarity_engine
from backend.app.services.prioritization_service import PrioritizationService

class EmergingIssueDetector:
    """
    Dedicated Civic Incident Detection Service 2.0.
    Combines text semantics, spatial distance, temporal rolling windows,
    and visual hash compatibility into Collective Signal Intelligence with 
    explainable sub-score breakdowns.
    """

    def compute_match_signals(
        self,
        dist_meters: float,
        allowed_dist: float,
        text_sim: float,
        report_created_at: Optional[datetime],
        target_created_at: Optional[datetime],
        has_visual_match: bool = False
    ) -> Dict[str, Any]:
        """
        Computes explainable multi-factor match breakdown between report and incident/cluster.
        """
        spatial_score = round(max(0.0, 1.0 - (dist_meters / max(allowed_dist, 1.0))), 3)
        text_score = round(max(0.0, min(1.0, text_sim)), 3)

        # Temporal proximity decay
        time_diff_min = 30.0
        if report_created_at and target_created_at:
            if report_created_at.tzinfo is None:
                report_created_at = report_created_at.replace(tzinfo=timezone.utc)
            if target_created_at.tzinfo is None:
                target_created_at = target_created_at.replace(tzinfo=timezone.utc)
            time_diff_min = abs((report_created_at - target_created_at).total_seconds()) / 60.0
        
        temporal_score = round(max(0.0, 1.0 - (time_diff_min / float(settings.DETECTION_TIME_WINDOW_MINUTES * 2))), 3)
        visual_score = 1.0 if has_visual_match else 0.5

        overall_score = round(
            (0.35 * spatial_score) + (0.35 * text_score) + (0.20 * temporal_score) + (0.10 * visual_score),
            3
        )

        return {
            "overall_match_score": overall_score,
            "spatial_proximity_score": spatial_score,
            "semantic_text_score": text_score,
            "temporal_proximity_score": temporal_score,
            "visual_similarity_score": visual_score,
            "distance_meters": round(dist_meters, 1),
            "time_delta_minutes": round(time_diff_min, 1)
        }

    def process_new_report(self, db: Session, new_report: Report) -> Optional[Incident]:
        """
        Evaluates a newly submitted report against active incidents and unclustered reports.
        """
        matching_incident = self._find_matching_active_incident(db, new_report)
        if matching_incident:
            self._attach_report_to_incident(db, matching_incident, new_report)
            return matching_incident

        return self._evaluate_new_cluster(db, new_report)

    def _find_matching_active_incident(self, db: Session, report: Report) -> Optional[Incident]:
        active_statuses = [
            IncidentStatus.CANDIDATE, IncidentStatus.INVESTIGATING,
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
            allowed_dist = max(settings.DETECTION_DISTANCE_METERS, inc.radius_meters + 200.0)
            if dist <= allowed_dist:
                sim = similarity_engine.compute_similarity(report.description, inc.description)
                if sim >= 0.25:
                    return inc

        return None

    def _attach_report_to_incident(self, db: Session, incident: Incident, report: Report):
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

        signals = self.compute_match_signals(
            dist_meters=dist,
            allowed_dist=max(settings.DETECTION_DISTANCE_METERS, incident.radius_meters + 200.0),
            text_sim=sim,
            report_created_at=report.created_at,
            target_created_at=incident.latest_activity_at
        )

        link = IncidentReport(
            incident_id=incident.id,
            report_id=report.id,
            similarity_score=sim,
            distance_meters=round(dist, 1),
            match_signals=signals
        )
        db.add(link)

        incident.report_count += 1
        incident.latest_activity_at = datetime.now(timezone.utc)
        
        reporter_ids = {r.report.citizen_id for r in incident.report_associations if r.report and r.report.citizen_id}
        if report.citizen_id:
            reporter_ids.add(report.citizen_id)
        incident.unique_reporter_count = max(len(reporter_ids), 1)

        # Recalculate smart priority
        cat = db.query(CivicCategory).filter(CivicCategory.id == incident.category_id).first()
        cat_name = cat.name if cat else "Civic Issue"
        p_calc = PrioritizationService.calculate_priority(
            category_name=cat_name,
            report_count=incident.report_count,
            unique_reporters=incident.unique_reporter_count,
            geographic_area=incident.geographic_area,
            avg_severity_score=0.6,
            created_at=incident.created_at,
            manual_override=incident.manual_priority_override,
            override_band=incident.priority
        )
        incident.priority = p_calc["priority_band"]
        incident.priority_score = p_calc["priority_score"]
        incident.priority_breakdown = p_calc["breakdown"]
        incident.sla_due_date = p_calc["sla_due_date"]

        evidence = dict(incident.evidence_summary or {})
        evidence["last_escalation_reason"] = f"New report {report.reference_no} added within {round(dist)}m"
        evidence["report_count"] = incident.report_count
        evidence["unique_reporter_count"] = incident.unique_reporter_count
        incident.evidence_summary = evidence
        incident.match_signals_breakdown = signals

        report.status = "verified"

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
        time_cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.DETECTION_TIME_WINDOW_MINUTES)
        
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

        min_reports = settings.DETECTION_MIN_WATER_REPORTS if new_report.category_id == 1 else settings.DETECTION_MIN_REPORTS_DEFAULT
        min_unique_reporters = settings.DETECTION_MIN_UNIQUE_REPORTERS

        if len(nearby_reports) < min_reports:
            new_report.status = "submitted"
            db.commit()
            return None

        unique_reporters = {r[0].citizen_id for r in nearby_reports if r[0].citizen_id}
        if len(unique_reporters) < min_unique_reporters and len(nearby_reports) < (min_reports + 1):
            return None

        # Build Candidate Incident
        points = [(r[0].latitude, r[0].longitude) for r in nearby_reports]
        c_lat, c_lon, radius = calculate_centroid_and_radius(points)

        category = db.query(CivicCategory).filter(CivicCategory.id == new_report.category_id).first()
        cat_name = category.name if category else "Civic Issue"
        area_name = new_report.address or new_report.landmark or f"{new_report.district or 'Chennai'} Cluster"

        inc_num = f"INC-{datetime.now().strftime('%Y%m')}-{uuid.uuid4().hex[:5].upper()}"
        
        times = [r[0].created_at for r in nearby_reports if r[0].created_at]
        times.sort()
        time_span_minutes = round((times[-1] - times[0]).total_seconds() / 60.0, 1) if len(times) > 1 else 0

        avg_similarity = round(sum(r[2] for r in nearby_reports) / len(nearby_reports), 3)

        p_calc = PrioritizationService.calculate_priority(
            category_name=cat_name,
            report_count=len(nearby_reports),
            unique_reporters=max(len(unique_reporters), 1),
            geographic_area=area_name,
            avg_severity_score=0.6,
            created_at=times[0] if times else datetime.now(timezone.utc)
        )

        signals_breakdown = self.compute_match_signals(
            dist_meters=radius,
            allowed_dist=settings.DETECTION_DISTANCE_METERS,
            text_sim=avg_similarity,
            report_created_at=times[-1] if times else None,
            target_created_at=times[0] if times else None
        )

        evidence_summary = {
            "detection_algorithm": "Collective-Signal-Intelligence-2.0",
            "trigger_timestamp": datetime.now(timezone.utc).isoformat(),
            "time_window_minutes": settings.DETECTION_TIME_WINDOW_MINUTES,
            "actual_time_span_minutes": time_span_minutes,
            "total_reports_supporting": len(nearby_reports),
            "distinct_reporters": max(len(unique_reporters), 1),
            "affected_radius_meters": radius,
            "average_semantic_similarity": avg_similarity,
            "match_signals": signals_breakdown,
            "priority_breakdown": p_calc["breakdown"],
            "uncertainty_notes": "Identified automatically from collective citizen complaint burst. Physical inspection recommended."
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
            priority=p_calc["priority_band"],
            priority_score=p_calc["priority_score"],
            priority_breakdown=p_calc["breakdown"],
            sla_due_date=p_calc["sla_due_date"],
            detection_reason=detection_reason,
            evidence_summary=evidence_summary,
            match_signals_breakdown=signals_breakdown,
            report_count=len(nearby_reports),
            unique_reporter_count=max(len(unique_reporters), 1),
            first_reported_at=times[0] if times else datetime.now(timezone.utc),
            latest_activity_at=times[-1] if times else datetime.now(timezone.utc),
            is_demo=False
        )
        db.add(incident)
        db.flush()

        # Associate reports
        for rep, dist, sim in nearby_reports:
            r_signals = self.compute_match_signals(
                dist_meters=dist,
                allowed_dist=settings.DETECTION_DISTANCE_METERS,
                text_sim=sim,
                report_created_at=rep.created_at,
                target_created_at=incident.first_reported_at
            )
            link = IncidentReport(
                incident_id=incident.id,
                report_id=rep.id,
                similarity_score=sim,
                distance_meters=round(dist, 1),
                match_signals=r_signals
            )
            db.add(link)
            rep.status = "verified"

        db.add(StatusHistory(
            entity_type="incident",
            entity_id=incident.id,
            previous_status=None,
            new_status=IncidentStatus.CANDIDATE,
            actor_name="AI Detection Engine 2.0",
            notes=detection_reason
        ))

        db.add(AlertEvent(
            incident_id=incident.id,
            alert_level="emerging_candidate",
            trigger_rule=f"MIN_{cat_name.upper().replace(' ', '_')}_CLUSTER_EXCEEDED",
            evidence_json=evidence_summary,
            cooldown_until=datetime.now(timezone.utc) + timedelta(minutes=60)
        ))

        authorities = db.query(User).filter(User.role.in_([UserRole.AUTHORITY, UserRole.ADMIN])).all()
        for auth in authorities:
            db.add(Notification(
                user_id=auth.id,
                title=f"🚨 Candidate Incident Alert: {cat_name}",
                message=f"{incident.title} ({len(nearby_reports)} reports). Priority: {incident.priority.upper()} ({incident.priority_score} pts).",
                type="alert",
                entity_type="incident",
                entity_id=incident.id,
                link=f"/authority/incidents/{incident.id}"
            ))

        db.commit()
        db.refresh(incident)
        return incident

detector = EmergingIssueDetector()
