import os
import sys
import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from backend.app.ai.multimodal_advanced import advanced_ai
from backend.app.services.prioritization_service import PrioritizationService
from backend.app.services.early_warning_service import EarlyWarningService
from backend.app.services.copilot_service import CopilotService
from backend.app.services.anti_spam_service import AntiSpamService
from backend.app.core.database import SessionLocal, Base, engine
from backend.app.models.models import (
    CivicCategory, Report, Incident, EmergingRiskForecast, IncidentResolutionEvidence,
    ModelVersion, AIGovernanceMetric, User
)

def test_tamil_translation_and_ner():
    title = "சாக்கடை நீர் தேக்கம்"
    desc = "Usman Road, T. Nagar பகுதியில் சாக்கடை அடைப்பு ஏற்பட்டு துர்நாற்றம் அடிக்கிறது. விபத்து அபாயம்."
    result = advanced_ai.process_text_intelligence(title, desc)
    
    assert result["language"] == "ta"
    assert result["english_translation"] is not None
    assert "Sewage drain blockage" in result["english_translation"] or "Sewage" in result["english_translation"]
    assert "Usman Road" in result["entities"]["landmarks"]
    assert result["entities"]["affected_service"] is not None
    assert result["severity_score"] >= 0.5

def test_pii_detection_and_redaction():
    title = "Water leakage"
    desc = "Please contact me at 9840123456 or Aadhaar 1234-5678-9012 regarding contaminated water."
    result = advanced_ai.process_text_intelligence(title, desc)
    
    assert result["pii_flagged"] is True
    assert "[REDACTED_PHONE]" in result["pii_redacted_text"]
    assert "[REDACTED_GOVT_ID]" in result["pii_redacted_text"]
    assert "9840123456" not in result["pii_redacted_text"]

def test_prioritization_scoring():
    # Critical category in sensitive area with multiple reports
    res_crit = PrioritizationService.calculate_priority(
        category_name="Live Wire Electrical Hazard",
        report_count=6,
        unique_reporters=5,
        geographic_area="T. Nagar Usman Road Metro",
        avg_severity_score=0.9
    )
    assert res_crit["priority_score"] >= 80.0
    assert res_crit["priority_band"] == "critical"
    assert res_crit["sla_hours"] == 4

    # Low severity category with single report in quiet area
    res_low = PrioritizationService.calculate_priority(
        category_name="Street Light Failure",
        report_count=1,
        unique_reporters=1,
        geographic_area="Quiet Residential Lane",
        avg_severity_score=0.3
    )
    assert res_low["priority_score"] < 60.0
    assert res_low["priority_band"] in ["low", "medium"]

def test_database_and_copilot_service():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Run copilot query for citizen
        chat_cit = CopilotService.process_query(
            db=db,
            query="How do I file a civic complaint in Chennai?",
            user_role="citizen"
        )
        assert "Report Issue" in chat_cit["response"]
        assert "1913" in chat_cit["response"]

        # Run copilot query for authority
        chat_auth = CopilotService.process_query(
            db=db,
            query="Provide executive daily briefing",
            user_role="authority"
        )
        assert "Executive" in chat_auth["response"] or "Briefing" in chat_auth["response"]
        assert chat_auth["id"] is not None
    finally:
        db.close()

def run_all_advanced_tests():
    print("Running CrowdPulse TN Advanced AI Intelligence Tests...", flush=True)
    test_tamil_translation_and_ner()
    print("[PASS] test_tamil_translation_and_ner", flush=True)
    test_pii_detection_and_redaction()
    print("[PASS] test_pii_detection_and_redaction", flush=True)
    test_prioritization_scoring()
    print("[PASS] test_prioritization_scoring", flush=True)
    test_database_and_copilot_service()
    print("[PASS] test_database_and_copilot_service", flush=True)
    print("\nALL ADVANCED AI INTELLIGENCE UNIT TESTS PASSED SUCCESSFULLY! (100% SUCCESS)", flush=True)

if __name__ == "__main__":
    run_all_advanced_tests()
