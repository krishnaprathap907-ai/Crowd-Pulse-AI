import re
import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from backend.app.models.models import (
    Report, Incident, Department, CivicCategory, CopilotChat, EmergingRiskForecast, IncidentStatus, PriorityLevel
)
from backend.app.core.database import utcnow

TN_HELPLINES = {
    "GCC (Greater Chennai Corporation)": "1913 / 044-25619206",
    "CMWSSB (Metro Water & Sewerage)": "044-4567 4567",
    "TANGEDCO (Electricity Board)": "94987 94987",
    "Highways Dept Helpline": "1800-425-4747",
    "State Emergency Operations Centre": "1070",
    "District Collectorate Helpline": "1077",
    "Childline / Women Safety": "1098 / 181",
    "Police / Fire / Ambulance": "100 / 101 / 108"
}

class CopilotService:
    @staticmethod
    def process_query(
        db: Session,
        query: str,
        user_id: Optional[int] = None,
        user_role: str = "citizen"
    ) -> Dict[str, Any]:
        """
        Processes civic query grounded in live database state for citizens and authority users.
        """
        q = query.strip()
        q_lower = q.lower()
        role = (user_role or "citizen").lower()
        sources: List[Dict[str, Any]] = []
        response_text = ""

        # Check for report tracking reference (e.g. RPT-...)
        rpt_match = re.search(r"rpt-[a-zA-Z0-9\-]+", q_lower)
        inc_match = re.search(r"inc-[a-zA-Z0-9\-]+", q_lower)

        if rpt_match:
            rpt_code = rpt_match.group(0).upper()
            report = db.query(Report).filter(Report.tracking_number == rpt_code).first()
            if report:
                sources.append({"type": "report", "id": report.id, "tracking_number": report.tracking_number})
                status_desc = {
                    "submitted": "Received by system and undergoing AI duplicate verification.",
                    "verified": "Verified and grouped into a verified civic cluster.",
                    "in_progress": "Dispatched to department field squad for remediation.",
                    "resolved": "Work completed and verified with photographic evidence."
                }.get(report.status, report.status)

                response_text = (
                    f"**Report Status for {report.tracking_number}:**\n\n"
                    f"- **Issue Category:** {report.category.name if report.category else 'General'}\n"
                    f"- **Location:** {report.location_name or report.geographic_area}\n"
                    f"- **Current Status:** `{report.status.upper()}` — {status_desc}\n"
                    f"- **Submitted:** {report.created_at.strftime('%d %b %Y, %I:%M %p') if report.created_at else 'Recent'}\n\n"
                    f"If you need immediate municipal on-site assistance, Greater Chennai Corporation helpline is **1913**."
                )
            else:
                response_text = f"I searched the CrowdPulse database for tracking number `{rpt_code}`, but no active record was found. Please double-check your receipt code or submit a new report."

        elif inc_match:
            inc_code = inc_match.group(0).upper()
            incident = db.query(Incident).filter(Incident.incident_number == inc_code).first()
            if incident:
                sources.append({"type": "incident", "id": incident.id, "incident_number": incident.incident_number})
                response_text = (
                    f"**Incident Dossier: {incident.incident_number}**\n\n"
                    f"- **Title:** {incident.title}\n"
                    f"- **Priority:** **{incident.priority.upper()}** (Score: {incident.priority_score}/100)\n"
                    f"- **Status:** `{incident.status.upper()}`\n"
                    f"- **Reports Aggregated:** {incident.report_count} citizen reports\n"
                    f"- **Assigned Department:** {incident.assigned_department.name if incident.assigned_department else 'Triage Queue'}\n"
                    f"- **SLA Target:** {incident.sla_due_date.strftime('%d %b %Y %H:%M') if incident.sla_due_date else '24h Standard'}\n\n"
                    f"**Detection Reason:** {incident.detection_reason}"
                )
            else:
                response_text = f"Incident `{inc_code}` was not found in our live incident registry."

        # Authority operational queries
        elif role in ["authority", "staff", "admin", "department_official"]:
            if any(w in q_lower for w in ["critical", "high priority", "urgent", "most urgent"]):
                critical_incs = db.query(Incident).filter(
                    Incident.status.in_([IncidentStatus.INVESTIGATING, IncidentStatus.IN_PROGRESS, IncidentStatus.VERIFIED, IncidentStatus.CANDIDATE]),
                    Incident.priority.in_([PriorityLevel.CRITICAL, PriorityLevel.HIGH])
                ).order_by(Incident.priority_score.desc()).limit(5).all()

                if critical_incs:
                    response_text = f"**Current Urgent/Critical Incidents Requiring Immediate Action ({len(critical_incs)} found):**\n\n"
                    for inc in critical_incs:
                        sources.append({"type": "incident", "id": inc.id, "incident_number": inc.incident_number})
                        dept = inc.assigned_department.name if inc.assigned_department else "Unassigned"
                        response_text += f"- **{inc.incident_number}** ({inc.priority.upper()} - {inc.priority_score} pts): {inc.title} in *{inc.geographic_area}*. Dept: {dept}. Status: `{inc.status}`\n"
                    response_text += "\n💡 *Recommended Action: Reassign overdue field squads or dispatch emergency backup.*"
                else:
                    response_text = "Good news! There are currently no unresolved Critical-level incidents in the active queue."

            elif any(w in q_lower for w in ["sla", "overdue", "deadline"]):
                now = datetime.datetime.now(datetime.timezone.utc)
                overdue_incs = db.query(Incident).filter(
                    Incident.status.in_([IncidentStatus.INVESTIGATING, IncidentStatus.IN_PROGRESS, IncidentStatus.VERIFIED]),
                    Incident.sla_due_date < now
                ).limit(5).all()

                sources.extend([{"type": "incident", "id": i.id, "incident_number": i.incident_number} for i in overdue_incs])
                response_text = (
                    f"**SLA Compliance Alert:**\n\n"
                    f"There are currently **{len(overdue_incs)}** active incidents past their guaranteed resolution window.\n\n"
                )
                for inc in overdue_incs:
                    response_text += f"- **{inc.incident_number}** ({inc.title}) in {inc.geographic_area} — Assigned to {inc.assigned_department.name if inc.assigned_department else 'Triage'}\n"
                response_text += "\n*Please notify the respective zonal executive engineers immediately.*"

            elif any(w in q_lower for w in ["summary", "briefing", "overview", "executive"]):
                total_reports = db.query(func.count(Report.id)).scalar() or 0
                active_incidents = db.query(func.count(Incident.id)).filter(Incident.status != IncidentStatus.RESOLVED).scalar() or 0
                resolved_incidents = db.query(func.count(Incident.id)).filter(Incident.status == IncidentStatus.RESOLVED).scalar() or 0
                radar_spikes = db.query(func.count(EmergingRiskForecast.id)).filter(EmergingRiskForecast.risk_level.in_(["critical", "high"]), EmergingRiskForecast.is_active == True).scalar() or 0

                response_text = (
                    f"📊 **CrowdPulse TN Executive Daily Briefing**\n\n"
                    f"- **Total Citizen Reports Processed:** {total_reports}\n"
                    f"- **Active Collective Incidents:** {active_incidents}\n"
                    f"- **Successfully Resolved Incidents:** {resolved_incidents}\n"
                    f"- **Emerging Radar Anomaly Alerts:** {radar_spikes} high-velocity risk clusters\n\n"
                    f"**Operational Recommendation:** Focus inter-agency resources on waterlogging mitigation and sewer clearing in Central and South Chennai corridors."
                )

            else:
                # General search across geographic areas or categories
                areas = ["t. nagar", "velachery", "anna nagar", "omr", "guindy", "tambaram", "mylapore", "triplicane", "madurai", "coimbatore"]
                matched_area = next((a for a in areas if a in q_lower), None)
                if matched_area:
                    matched_incs = db.query(Incident).filter(
                        func.lower(Incident.geographic_area).contains(matched_area)
                    ).limit(5).all()
                    sources.extend([{"type": "incident", "id": i.id, "incident_number": i.incident_number} for i in matched_incs])
                    response_text = f"**Incident Intelligence for '{matched_area.title()}':**\n\n"
                    if matched_incs:
                        for i in matched_incs:
                            response_text += f"- **{i.incident_number}** ({i.priority.upper()}): {i.title} [{i.status.upper()}]\n"
                    else:
                        response_text += "No open major civic clusters found for this specific locality."
                else:
                    response_text = (
                        f"**Civic Operations Copilot Ready:**\n\n"
                        f"You can ask me operational questions such as:\n"
                        f"- *'Show all critical incidents requiring action'* \n"
                        f"- *'List SLA overdue incidents'* \n"
                        f"- *'Summarize complaints in Velachery or T. Nagar'* \n"
                        f"- *'Provide an executive daily briefing'* \n"
                        f"- Or enter any Incident ID (e.g. `INC-20261013-0001`) for complete telemetry."
                    )

        # Citizen inquiries
        else:
            if any(w in q_lower for w in ["how to report", "how do i", "how to file", "file complaint", "file a complaint", "file a civic", "complaint", "report issue", "புகார் செய்வது எப்படி", "submit issue"]):
                response_text = (
                    "**How to Report a Civic Issue on CrowdPulse TN:**\n\n"
                    "1. Click the **'Report Issue'** button in the navigation header.\n"
                    "2. Select the issue category (e.g., Waterlogging, Pothole, Live Wire, Sewage Overflow).\n"
                    "3. Enter the location or tap **'Detect Current Location'**.\n"
                    "4. Describe the situation in English or தமிழ்.\n"
                    "5. Attach a photo if possible (our AI automatically hashes and verifies duplicates).\n"
                    "6. Submit! You will receive an instant **Tracking ID** (e.g. `RPT-20261013-XXXX`) to monitor resolution in real time.\n\n"
                    "📞 For emergency municipal grievances in Chennai, GCC Helpline is **1913**."
                )

            elif any(w in q_lower for w in ["helpline", "emergency", "contact", "phone", "தொடர்பு எண்", "மின்சாரம்"]):
                response_text = "**Official Tamil Nadu Civic Helplines:**\n\n"
                for name, num in TN_HELPLINES.items():
                    response_text += f"- **{name}:** `{num}`\n"
                response_text += "\n*For live wires and gas leaks, stay at least 15 meters away and notify authorities immediately.*"

            elif any(w in q_lower for w in ["தண்ணீர்", "சாக்கடை", "ரோடு", "குப்பை", "மின்சாரம்", "விளக்கு"]):
                # Tamil language response support
                response_text = (
                    "**வணக்கம்! க்ரவுட்பல்ஸ் தமிழ்நாடு (CrowdPulse TN) உதவி மையம்:**\n\n"
                    "உங்கள் பகுதியில் உள்ள பொதுப் பிரச்சனைகளை (சாலை பள்ளங்கள், சாக்கடை அடைப்பு, தெருவிளக்கு பழுது, குடிநீர் பிரச்சனை) உடனடியாகப் பதிவு செய்யலாம்.\n\n"
                    "- **புதிய புகார் பதிவு செய்ய:** முகப்புப் பக்கத்தில் உள்ள 'புகார் அளிக்குக' (Report Issue) பொத்தானை அழுத்தவும்.\n"
                    "- **அவசர மாநகராட்சி உதவி எண்:** `1913` (சென்னை மாநகராட்சி)\n"
                    "- **மின்சார வாரிய உதவி எண்:** `94987 94987` (TANGEDCO)\n"
                    "- **குடிநீர் & கழிவுநீர் வாரியம்:** `044-4567 4567` (CMWSSB)\n\n"
                    "உங்கள் புகார் எண் (Tracking Number) இருந்தால் இங்கே பதிவிட்டு உடனடி நிலவரத்தை அறியலாம்."
                )

            elif any(w in q_lower for w in ["water", "sewage", "drain", "flood", "rain", "pothole", "wire"]):
                response_text = (
                    "**Civic Safety & Remediation Guidance:**\n\n"
                    "- **Waterlogging / Flooding:** Do not drive through flooded subways. Greater Chennai Corporation emergency pumps are mobilized via 1913.\n"
                    "- **Sewage Overflow:** Contact CMWSSB round-the-clock complaint cell at 044-4567 4567.\n"
                    "- **Live Wires / Transformer Sparks:** Stay clear and immediately call TANGEDCO Minnagam helpline 94987 94987.\n"
                    "- **Potholes & Cave-ins:** Report with a photograph so the municipal road patch unit can be auto-routed."
                )

            else:
                response_text = (
                    f"Hello! I am your **CrowdPulse TN Civic Assistant**.\n\n"
                    f"I can assist you with:\n"
                    f"- Tracking your complaint status (type your `RPT-...` tracking number)\n"
                    f"- Reporting streetlights, sewage, water contamination, or potholes\n"
                    f"- Official Tamil Nadu emergency and municipal helplines\n"
                    f"- Bilingual support in English and தமிழ்\n\n"
                    f"How can I help you make Tamil Nadu safer and cleaner today?"
                )

        # Save conversation to CopilotChat table
        chat_log = CopilotChat(
            user_id=user_id,
            role=role,
            query=query,
            response=response_text,
            sources_json=sources,
            created_at=utcnow()
        )
        db.add(chat_log)
        db.commit()
        db.refresh(chat_log)

        return {
            "id": chat_log.id,
            "query": query,
            "response": response_text,
            "role": role,
            "sources": sources,
            "created_at": chat_log.created_at.isoformat() if chat_log.created_at else None
        }

    @staticmethod
    def get_quick_prompts(role: str = "citizen") -> List[str]:
        if role.lower() in ["authority", "staff", "admin"]:
            return [
                "Show all critical incidents requiring action",
                "List SLA overdue incidents",
                "Summarize issues in Velachery and T. Nagar",
                "Provide an executive daily briefing",
                "What is the status of INC-20261013-0001?"
            ]
        return [
            "How do I file a civic complaint?",
            "Official Tamil Nadu emergency helplines",
            "Track status of RPT-20261013-0001",
            "புகார் செய்வது எப்படி? (How to report in Tamil)",
            "Safety tips for waterlogging and live wires"
        ]
