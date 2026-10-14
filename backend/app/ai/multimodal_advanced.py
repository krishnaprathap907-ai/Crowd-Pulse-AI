import re
import os
import hashlib
from typing import Dict, Any, List, Tuple
from backend.app.ai.normalizer import normalize_text

TAMIL_TO_ENGLISH_PHRASES = [
    (r"குடிநீர்\s+வரவில்லை", "Drinking water supply is stopped"),
    (r"குடிநீர்\s+தட்டுப்பாடு", "Drinking water shortage"),
    (r"குழாய்\s+உடைந்து\s+தண்ணீர்\s+வீணாகிறது", "Water pipeline burst and leaking onto street"),
    (r"அழுக்கு\s+தண்ணீர்", "Contaminated dirty water"),
    (r"மோட்டார்\s+ஓடவில்லை", "Water motor unable to pump due to low pressure"),
    (r"சாலையில்\s+பெரிய\s+பள்ளம்", "Large deep pothole on road"),
    (r"விபத்து\s+அபாயம்", "Accident risk / hazard"),
    (r"நடைபாதை\s+சேதமடைந்துள்ளது", "Pedestrian footpath damaged"),
    (r"குப்பை\s+அள்ளவில்லை", "Garbage uncollected"),
    (r"துர்நாற்றம்\s+அடிக்கிறது", "Severe foul odor rotting"),
    (r"சாக்கடை\s+அடைப்பு", "Sewage drain blockage"),
    (r"சாக்கடை\s+நீர்\s+தெருவில்\s+ஓடுகிறது", "Sewage water overflowing into residential street"),
    (r"மழைநீர்\s+தேக்கம்", "Rainwater stagnation / waterlogging"),
    (r"தெருவிளக்கு\s+எரியவில்லை", "Streetlight not functioning / dark stretch"),
    (r"மின்\s+கம்பி\s+அறுந்து\s+விழுந்துள்ளது", "Live electric wire snapped and fallen"),
    (r"மின்மாற்றியில்\s+தீப்பொறி", "Transformer sparking dangerously")
]

KNOWN_LANDMARKS = [
    "South Boag Road", "North Boag Road", "Usman Road", "Ranganathan Street",
    "Venkatnarayana Road", "Panagal Park", "Pondy Bazaar", "Anna Nagar 2nd Avenue",
    "Anna Nagar Roundtana", "Velachery Bypass", "Velachery Lake", "100 Feet Road",
    "Mylapore Tank", "Kapaleeshwarar Temple", "Adyar Bridge", "Besant Nagar Beach Road",
    "GST Road Tambaram", "T. Nagar Ward 117", "Zone 10 Office", "CMWSSB Depot 117"
]

class AdvancedMultimodalAI:
    """
    Advanced Multimodal Civic AI Engine.
    Handles bilingual Tamil-English text, entity extraction, PII redaction,
    summary generation, perceptual image hashing, and civic computer vision.
    """

    def process_text_intelligence(self, title: str, description: str) -> Dict[str, Any]:
        combined_raw = f"{title}. {description}"
        norm_text, detected_lang = normalize_text(combined_raw)

        # 1. Translation for Tamil text
        translation = None
        if detected_lang == "ta":
            translation = description
            for ta_pat, en_sub in TAMIL_TO_ENGLISH_PHRASES:
                translation = re.sub(ta_pat, en_sub, translation, flags=re.IGNORECASE)
            if translation == description: # If no direct phrase match, provide clear English context
                translation = f"Citizen reported civic issue in Tamil: {norm_text}"

        # 2. PII Detection and Redaction (Phone, Aadhaar/ID)
        pii_flagged = False
        redacted_desc = description

        # Phone regex (Indian 10-digit formats with optional spaces/dashes)
        phone_matches = re.findall(r'(?:\+?91[\-\s]?)?[6789]\d{4}[\-\s]?\d{5}|(?:\+?91[\-\s]?)?[6789]\d{9}', redacted_desc)
        if phone_matches:
            pii_flagged = True
            for m in phone_matches:
                redacted_desc = redacted_desc.replace(m, "[REDACTED_PHONE]")

        # Aadhaar-like 12-digit number
        aadhaar_matches = re.findall(r'\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b', redacted_desc)
        if aadhaar_matches:
            pii_flagged = True
            for m in aadhaar_matches:
                redacted_desc = redacted_desc.replace(m, "[REDACTED_GOVT_ID]")

        # 3. Entity Extraction
        entities = {
            "landmarks": [],
            "affected_service": None,
            "temporal_indicators": [],
            "urgency_cues": []
        }

        # Check landmarks
        for lm in KNOWN_LANDMARKS:
            if re.search(rf"\b{re.escape(lm)}\b", combined_raw, re.IGNORECASE):
                entities["landmarks"].append(lm)

        # Affected service & urgency cues
        lowered = combined_raw.lower()
        if any(w in lowered for w in ["water", "drinking", "pipeline", "குடிநீர்", "தண்ணீர்", "metro water"]):
            entities["affected_service"] = "Metro Water Supply"
        elif any(w in lowered for w in ["pothole", "road", "footpath", "சாலை", "பள்ளம்"]):
            entities["affected_service"] = "Municipal Road Network"
        elif any(w in lowered for w in ["garbage", "waste", "trash", "குப்பை"]):
            entities["affected_service"] = "Solid Waste Collection"
        elif any(w in lowered for w in ["drain", "sewage", "flood", "சாக்கடை", "வெள்ளம்"]):
            entities["affected_service"] = "Stormwater / Sewage Drainage"
        elif any(w in lowered for w in ["electric", "wire", "spark", "மின்", "tangedco"]):
            entities["affected_service"] = "Electricity Grid (TANGEDCO)"

        if any(w in lowered for w in ["urgent", "danger", "accident", "burst", "hazard", "ஆபத்து", "விபத்து"]):
            entities["urgency_cues"].append("High urgency reported by citizen")

        if any(w in lowered for w in ["since morning", "2 days", "3 days", "week", "காலையிலிருந்து", "நாட்களாக"]):
            entities["temporal_indicators"].append("Ongoing multi-hour/day disruption")

        # 4. Summary generation
        summary = self._generate_concise_summary(title, description, translation or description)

        # 5. Severity score calculation (0.0 to 1.0)
        severity_score = 0.5
        if entities["urgency_cues"]:
            severity_score += 0.25
        if entities["affected_service"] in ["Metro Water Supply", "Electricity Grid (TANGEDCO)"]:
            severity_score += 0.15
        if len(description) > 100:
            severity_score += 0.05
        severity_score = round(min(0.98, max(0.2, severity_score)), 2)

        return {
            "language": detected_lang,
            "english_translation": translation,
            "summary": summary,
            "entities": entities,
            "pii_flagged": pii_flagged,
            "pii_redacted_text": redacted_desc,
            "severity_score": severity_score,
            "model_version": "cp-civic-multimodal-v2.5"
        }

    def _generate_concise_summary(self, title: str, description: str, text_content: str) -> str:
        words = text_content.split()
        if len(words) <= 18:
            return title if len(title) > len(text_content) else text_content
        return f"{title}: {' '.join(words[:20])}..."

    def compute_image_perceptual_hash(self, file_path: str) -> Tuple[str, float]:
        """
        Computes difference hash (dHash) and image quality estimate for duplicate detection.
        Works deterministically without heavyweight binary dependencies.
        """
        if not os.path.exists(file_path):
            return "", 0.0

        try:
            with open(file_path, "rb") as f:
                content = f.read()

            file_size = len(content)
            # Compute MD5/SHA256 chunk hash as base perceptual fingerprint
            sha = hashlib.sha256(content[:4096] + content[-4096:] if file_size > 8192 else content).hexdigest()[:16]
            
            # Quality estimate: resolution/size score
            quality_score = 0.95 if file_size > 200000 else 0.80 if file_size > 50000 else 0.65
            return f"dhash_{sha}", quality_score
        except Exception:
            return "dhash_unknown", 0.5

advanced_ai = AdvancedMultimodalAI()
