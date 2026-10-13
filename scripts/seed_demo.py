import os
import sys
from datetime import datetime, timedelta, timezone

# Ensure project root is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.core.database import SessionLocal, Base, engine
from backend.app.core.security import get_password_hash
from backend.app.models.models import (
    User, UserProfile, Department, CivicCategory, Report, ReportAnalysis,
    Incident, IncidentReport, StatusHistory, Notification, AlertEvent,
    ApplicationSetting, UserRole, IncidentStatus, PriorityLevel
)

def run_seed():
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # 1. Seed Civic Categories
        categories_data = [
            {"id": 1, "name": "Water Supply", "slug": "water-supply", "icon": "Droplet", "color": "#0F9D8A", "desc": "Pipeline leaks, water pressure drops, contaminated water, supply stoppage"},
            {"id": 2, "name": "Roads & Footpaths", "slug": "roads", "icon": "AlertTriangle", "color": "#F2B544", "desc": "Potholes, broken footpaths, damaged tarmac, hazardous craters"},
            {"id": 3, "name": "Waste Management", "slug": "waste-management", "icon": "Trash2", "color": "#8C68CD", "desc": "Garbage accumulation, overflowing bins, missed collection, illegal dumping"},
            {"id": 4, "name": "Flooding & Drainage", "slug": "flooding-drainage", "icon": "CloudRain", "color": "#2D9B68", "desc": "Stormwater drain blockages, sewage overflow, stagnant rainwater"},
            {"id": 5, "name": "Streetlights", "slug": "streetlights", "icon": "Sun", "color": "#E67E22", "desc": "Non-functional street lamps, dark stretches, broken poles"},
            {"id": 6, "name": "Electricity Hazards", "slug": "electricity-hazards", "icon": "Zap", "color": "#D9485F", "desc": "Hanging wires, transformer sparks, open junction boxes"},
            {"id": 7, "name": "Public Infrastructure", "slug": "public-infrastructure", "icon": "Building", "color": "#3498DB", "desc": "Damaged bus shelters, corporation parks, broken boundary walls"},
            {"id": 8, "name": "Other Civic Issues", "slug": "other", "icon": "HelpCircle", "color": "#95A5A6", "desc": "Miscellaneous civic grievances requiring departmental review"},
        ]

        for c_data in categories_data:
            existing = db.query(CivicCategory).filter(CivicCategory.id == c_data["id"]).first()
            if not existing:
                db.add(CivicCategory(
                    id=c_data["id"],
                    name=c_data["name"],
                    slug=c_data["slug"],
                    icon=c_data["icon"],
                    color=c_data["color"],
                    description=c_data["desc"],
                    is_active=True
                ))
        db.commit()

        # 2. Seed Departments
        departments_data = [
            {"name": "Chennai Metro Water Supply & Sewerage Board (CMWSSB)", "code": "CMWSSB", "desc": "Responsible for water pipelines, treatment and distribution across Greater Chennai."},
            {"name": "Greater Chennai Corporation - Roads & Bridges", "code": "GCC-ROADS", "desc": "Maintains municipal roads, pedestrian walkways and bridges."},
            {"name": "Solid Waste Management Department", "code": "GCC-SWM", "desc": "Oversees daily door-to-door collection, bin clearance and waste transit."},
            {"name": "Stormwater Drainage & Flood Mitigation Division", "code": "GCC-SWD", "desc": "Manages stormwater canal networks and monsoon flood mitigation."},
            {"name": "Tamil Nadu Generation and Distribution Corporation (TANGEDCO)", "code": "TANGEDCO", "desc": "Maintains electrical supply grid, transformers and streetlights."},
        ]

        for d_data in departments_data:
            existing = db.query(Department).filter(Department.code == d_data["code"]).first()
            if not existing:
                db.add(Department(
                    name=d_data["name"],
                    code=d_data["code"],
                    description=d_data["desc"],
                    contact_email=f"{d_data['code'].lower()}@tngov.demo",
                    is_active=True
                ))
        db.commit()

        # 3. Seed Users (Demo Accounts)
        users_data = [
            # Citizens
            {"email": "citizen@crowdpulse.tn", "name": "Karthik Subramanian", "role": UserRole.CITIZEN, "phone": "+91 98401 23456", "neighborhood": "T. Nagar", "lang": "en"},
            {"email": "citizen.priya@crowdpulse.tn", "name": "Priya Ramakrishnan", "role": UserRole.CITIZEN, "phone": "+91 98402 34567", "neighborhood": "T. Nagar - South Boag", "lang": "ta"},
            {"email": "citizen.anand@crowdpulse.tn", "name": "Anand Natarajan", "role": UserRole.CITIZEN, "phone": "+91 98403 45678", "neighborhood": "T. Nagar - Usman Road", "lang": "en"},
            {"email": "citizen.meena@crowdpulse.tn", "name": "Meena Sundaram", "role": UserRole.CITIZEN, "phone": "+91 98404 56789", "neighborhood": "T. Nagar - Venkatnarayana", "lang": "ta"},
            {"email": "citizen.velu@crowdpulse.tn", "name": "Velmurugan K", "role": UserRole.CITIZEN, "phone": "+91 98405 67890", "neighborhood": "Anna Nagar", "lang": "ta"},
            {"email": "citizen.deepa@crowdpulse.tn", "name": "Deepa Venkatesh", "role": UserRole.CITIZEN, "phone": "+91 98406 78901", "neighborhood": "Velachery", "lang": "en"},

            # Authority Officers
            {"email": "officer@crowdpulse.tn", "name": "Dr. S. Radhakrishnan, IAS", "role": UserRole.AUTHORITY, "phone": "+91 94440 11111", "neighborhood": "Ripon Building", "lang": "en"},
            {"email": "authority.cmwssb@crowdpulse.tn", "name": "Executive Engineer - CMWSSB Zone 10", "role": UserRole.AUTHORITY, "phone": "+91 94440 22222", "neighborhood": "T. Nagar Division", "lang": "en"},

            # Department Staff
            {"email": "staff.roads@crowdpulse.tn", "name": "Murugesan R (Junior Engineer)", "role": UserRole.STAFF, "phone": "+91 94440 33333", "neighborhood": "Zone 10 Office", "lang": "ta"},
            {"email": "staff.water@crowdpulse.tn", "name": "Senthamizh Selvan (Field Supervisor)", "role": UserRole.STAFF, "phone": "+91 94440 44444", "neighborhood": "CMWSSB Depot 117", "lang": "ta"},

            # Admin
            {"email": "admin@crowdpulse.tn", "name": "System Administrator", "role": UserRole.ADMIN, "phone": "+91 94440 99999", "neighborhood": "IT Operations Centre", "lang": "en"}
        ]

        for u_data in users_data:
            existing = db.query(User).filter(User.email == u_data["email"]).first()
            if not existing:
                new_user = User(
                    email=u_data["email"],
                    full_name=u_data["name"],
                    hashed_password=get_password_hash("DemoPass123!"),
                    role=u_data["role"],
                    phone=u_data["phone"],
                    is_active=True
                )
                db.add(new_user)
                db.flush()
                db.add(UserProfile(
                    user_id=new_user.id,
                    preferred_language=u_data["lang"],
                    neighborhood=u_data["neighborhood"],
                    district="Chennai"
                ))
        db.commit()

        # 4. Seed Demonstrative Reports & Incidents
        # Scenario A: The Water Supply Crisis Cluster in T. Nagar (5 distinct citizen reports within 2 hours)
        now = datetime.now(timezone.utc)
        karthik = db.query(User).filter(User.email == "citizen@crowdpulse.tn").first()
        priya = db.query(User).filter(User.email == "citizen.priya@crowdpulse.tn").first()
        anand = db.query(User).filter(User.email == "citizen.anand@crowdpulse.tn").first()
        meena = db.query(User).filter(User.email == "citizen.meena@crowdpulse.tn").first()
        officer = db.query(User).filter(User.email == "officer@crowdpulse.tn").first()

        cmwssb = db.query(Department).filter(Department.code == "CMWSSB").first()
        gcc_roads = db.query(Department).filter(Department.code == "GCC-ROADS").first()

        water_reports_data = [
            {
                "ref": "TN-2610-WAT01", "user": karthik, "min_ago": 110,
                "title": "Severe drop in drinking water pressure",
                "desc": "Metro water pipeline pressure dropped completely this morning. No water reaching overhead tank on South Boag Road.",
                "lat": 13.0392, "lon": 80.2335, "addr": "South Boag Road, T. Nagar", "sev": "high"
            },
            {
                "ref": "TN-2610-WAT02", "user": priya, "min_ago": 95,
                "title": "குடிநீர் குழாயில் அழுக்கு தண்ணீர் வருகிறது",
                "desc": "காலையிலிருந்து குடிநீர் வரவில்லை. குழாயை திறந்தால் சேறு கலந்த தண்ணீர் வருகிறது. தட்டுப்பாடு ஏற்பட்டுள்ளது.",
                "lat": 13.0401, "lon": 80.2348, "addr": "Usman Road Cross, T. Nagar", "sev": "critical"
            },
            {
                "ref": "TN-2610-WAT03", "user": anand, "min_ago": 70,
                "title": "Underground main water pipeline burst leaking on street",
                "desc": "Massive clean water leak near Ranganathan street entrance. Clean water flowing into road while houses have zero water supply.",
                "lat": 13.0415, "lon": 80.2329, "addr": "Ranganathan Street Junction, T. Nagar", "sev": "critical"
            },
            {
                "ref": "TN-2610-WAT04", "user": meena, "min_ago": 45,
                "title": "தண்ணீர் வரவில்லை மோட்டார் ஓடவில்லை",
                "desc": "வெங்கட்நாராயணா சாலையில் உள்ள அனைத்து வீடுகளிலும் குடிநீர் வரவில்லை. மெட்ரோ வாட்டர் சப்ளை முற்றிலும் முடங்கியுள்ளது.",
                "lat": 13.0384, "lon": 80.2356, "addr": "Venkatnarayana Road, T. Nagar", "sev": "high"
            },
            {
                "ref": "TN-2610-WAT05", "user": karthik, "min_ago": 25,
                "title": "No tanker water and pipeline empty across ward 117",
                "desc": "Multiple apartment blocks on Boag Road have run dry. Need emergency pipeline repair by metro water depot.",
                "lat": 13.0398, "lon": 80.2341, "addr": "South Boag Road Ward 117, T. Nagar", "sev": "high"
            }
        ]

        water_report_objs = []
        for rd in water_reports_data:
            existing_rep = db.query(Report).filter(Report.reference_no == rd["ref"]).first()
            if not existing_rep:
                rep = Report(
                    reference_no=rd["ref"],
                    citizen_id=rd["user"].id if rd["user"] else None,
                    title=rd["title"],
                    description=rd["desc"],
                    category_id=1,
                    latitude=rd["lat"],
                    longitude=rd["lon"],
                    address=rd["addr"],
                    district="Chennai",
                    severity=rd["sev"],
                    status="linked_to_incident",
                    created_at=now - timedelta(minutes=rd["min_ago"]),
                    observation_time=now - timedelta(minutes=rd["min_ago"])
                )
                db.add(rep)
                db.flush()
                db.add(ReportAnalysis(
                    report_id=rep.id,
                    normalized_text=rd["desc"].lower(),
                    language_detected="ta" if "தண்ணீர்" in rd["desc"] else "en",
                    predicted_category_id=1,
                    confidence_score=0.94,
                    model_version="cp-civic-nlp-v2.1",
                    processing_status="completed"
                ))
                water_report_objs.append(rep)
            else:
                water_report_objs.append(existing_rep)
        db.commit()

        # Create the Consolidated Water Incident (Sample Candidate Incident for Authority to Review & Verify)
        inc_water_num = "INC-2610-WAT01"
        existing_water_inc = db.query(Incident).filter(Incident.incident_number == inc_water_num).first()
        if not existing_water_inc:
            evidence_data = {
                "detection_algorithm": "DBSCAN-Spatial-Temporal-TFIDF-v2",
                "trigger_timestamp": (now - timedelta(minutes=20)).isoformat(),
                "time_window_minutes": 180,
                "actual_time_span_minutes": 85.0,
                "total_reports_supporting": 5,
                "distinct_reporters": 4,
                "affected_radius_meters": 380.0,
                "average_semantic_similarity": 0.68,
                "affected_streets_landmarks": ["South Boag Road", "Usman Road", "Ranganathan Street", "Venkatnarayana Road"],
                "arrival_rate_per_hour": 3.5,
                "uncertainty_notes": "Identified automatically from collective citizen complaint burst. Inspection needed to pinpoint pipeline rupture on Boag Road junction."
            }

            water_incident = Incident(
                incident_number=inc_water_num,
                title="Emerging Water Supply Interruption in T. Nagar (Ward 117)",
                category_id=1,
                description="Cluster of 5 citizen reports within 380m and 85 minutes indicating mainline pipeline burst and widespread drinking water stoppage.",
                geographic_area="T. Nagar - Ward 117 (Boag & Usman Rd)",
                district="Chennai",
                center_latitude=13.0398,
                center_longitude=80.2342,
                radius_meters=380.0,
                status=IncidentStatus.CANDIDATE, # Starts as CANDIDATE so user/officer can test Verification!
                priority=PriorityLevel.CRITICAL,
                detection_reason="Detected emerging water supply incident based on 5 reports from 4 unique citizens within 380m radius over 85 minutes in T. Nagar.",
                evidence_summary=evidence_data,
                report_count=5,
                unique_reporter_count=4,
                first_reported_at=now - timedelta(minutes=110),
                latest_activity_at=now - timedelta(minutes=25),
                is_demo=True,
                created_at=now - timedelta(minutes=20)
            )
            db.add(water_incident)
            db.flush()

            for rep_obj in water_report_objs:
                db.add(IncidentReport(
                    incident_id=water_incident.id,
                    report_id=rep_obj.id,
                    similarity_score=0.78,
                    distance_meters=140.0
                ))

            db.add(StatusHistory(
                entity_type="incident",
                entity_id=water_incident.id,
                previous_status=None,
                new_status=IncidentStatus.CANDIDATE,
                actor_name="AI Detection Engine",
                notes="Candidate incident generated automatically from 5 collective citizen signals."
            ))

            db.add(AlertEvent(
                incident_id=water_incident.id,
                alert_level="critical_burst",
                trigger_rule="WATER_SUPPLY_CLUSTER_THRESHOLD_EXCEEDED",
                evidence_json=evidence_data,
                cooldown_until=now + timedelta(minutes=45)
            ))

            # Add Authority notification
            if officer:
                db.add(Notification(
                    user_id=officer.id,
                    title="🚨 Urgent Candidate Incident: Water Supply",
                    message="INC-2610-WAT01: 5 reports in T. Nagar Ward 117. Pipeline burst suspected. Requires official verification.",
                    type="alert",
                    entity_type="incident",
                    entity_id=water_incident.id,
                    link=f"/authority/incidents/{water_incident.id}"
                ))

        # Scenario B: Officially Verified & Assigned Road Damage Incident in Anna Nagar
        inc_road_num = "INC-2610-ROD02"
        existing_road_inc = db.query(Incident).filter(Incident.incident_number == inc_road_num).first()
        if not existing_road_inc:
            velu = db.query(User).filter(User.email == "citizen.velu@crowdpulse.tn").first()
            road_rep = Report(
                reference_no="TN-2610-ROD01",
                citizen_id=velu.id if velu else None,
                title="Deep hazardous pothole on 2nd Avenue",
                description="Deep pothole right after traffic signal. Two two-wheelers skidded last night during rain.",
                category_id=2,
                latitude=13.0850,
                longitude=80.2100,
                address="2nd Avenue, Anna Nagar",
                district="Chennai",
                severity="high",
                status="linked_to_incident",
                created_at=now - timedelta(hours=8)
            )
            db.add(road_rep)
            db.flush()

            road_inc = Incident(
                incident_number=inc_road_num,
                title="Hazardous Pothole Cluster on Anna Nagar 2nd Avenue",
                category_id=2,
                description="Multiple road surface damage complaints along 2nd Avenue causing severe traffic bottleneck.",
                geographic_area="Anna Nagar 2nd Avenue",
                district="Chennai",
                center_latitude=13.0852,
                center_longitude=80.2105,
                radius_meters=250.0,
                status=IncidentStatus.ASSIGNED,
                priority=PriorityLevel.HIGH,
                detection_reason="Clustered 3 road damage complaints within 250m along 2nd Avenue.",
                evidence_summary={"total_reports": 3, "unique_reporters": 3, "verified_by": "Dr. S. Radhakrishnan, IAS"},
                report_count=3,
                unique_reporter_count=3,
                first_reported_at=now - timedelta(hours=9),
                latest_activity_at=now - timedelta(hours=5),
                assigned_department_id=gcc_roads.id if gcc_roads else None,
                public_update="GCC Roads division assigned. Asphalt cold-patching scheduled for tonight.",
                internal_notes="Junior Engineer Murugesan dispatched to barricade area.",
                is_demo=True,
                created_at=now - timedelta(hours=7)
            )
            db.add(road_inc)
            db.flush()
            db.add(IncidentReport(incident_id=road_inc.id, report_id=road_rep.id))

        # Scenario C: Resolved Waste Management Incident in Velachery
        inc_waste_num = "INC-2610-WAS03"
        existing_waste_inc = db.query(Incident).filter(Incident.incident_number == inc_waste_num).first()
        if not existing_waste_inc:
            deepa = db.query(User).filter(User.email == "citizen.deepa@crowdpulse.tn").first()
            waste_rep = Report(
                reference_no="TN-2610-WAS01",
                citizen_id=deepa.id if deepa else None,
                title="Garbage accumulation near Velachery Lake road",
                description="Overflowing corporation bins uncollected for 5 days. Severe stench and stray animals.",
                category_id=3,
                latitude=12.9810,
                longitude=80.2180,
                address="Bypass Road, Velachery",
                district="Chennai",
                severity="medium",
                status="linked_to_incident",
                created_at=now - timedelta(hours=28)
            )
            db.add(waste_rep)
            db.flush()

            waste_inc = Incident(
                incident_number=inc_waste_num,
                title="Overflowing Waste Accumulation near Velachery Lake Bypass",
                category_id=3,
                description="Cluster of commercial and household waste accumulation complaints resolved by GCC SWM compactor truck.",
                geographic_area="Velachery Lake Bypass",
                district="Chennai",
                center_latitude=12.9815,
                center_longitude=80.2185,
                radius_meters=300.0,
                status=IncidentStatus.CLOSED,
                priority=PriorityLevel.MEDIUM,
                detection_reason="Detected repeated missed-collection complaints from 4 nearby households.",
                evidence_summary={"total_reports": 4, "resolution_time_hours": 3.8},
                report_count=4,
                unique_reporter_count=4,
                first_reported_at=now - timedelta(hours=30),
                latest_activity_at=now - timedelta(hours=24),
                public_update="Clearance completed by night compactor vehicle. Bins disinfected with bleaching powder.",
                resolution_notes="GCC SWM deployed compactor #TN-01-GCC-4412. Waste cleared and area sanitized.",
                resolved_at=now - timedelta(hours=22),
                is_demo=True,
                created_at=now - timedelta(hours=28)
            )
            db.add(waste_inc)
            db.flush()
            db.add(IncidentReport(incident_id=waste_inc.id, report_id=waste_rep.id))

        db.commit()
        print("Demo dataset seeded successfully!")
        return True
    except Exception as e:
        db.rollback()
        print(f"Error seeding demo data: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()
