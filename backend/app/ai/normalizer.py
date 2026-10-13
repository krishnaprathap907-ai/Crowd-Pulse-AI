import re
import unicodedata
from typing import Tuple

TAMIL_KEYWORDS = {
    # Water supply
    "தண்ணீர்": "water", "குடிநீர்": "drinking water", "தண்ணி": "water", "குழாய்": "pipe", 
    "கசிவு": "leakage", "வடிகால்": "drainage", "தட்டுப்பாடு": "shortage", "மோட்டார்": "motor",
    # Roads
    "பள்ளம்": "pothole", "சாலை": "road", "தெரு": "street", "தார்": "tar", "நடைபாதை": "footpath",
    # Waste
    "குப்பை": "garbage", "கழிவு": "waste", "தொட்டி": "bin", "துர்நாற்றம்": "stink odor",
    # Drainage / Flooding
    "சாக்கடை": "sewage", "வெள்ளம்": "flood", "மழைநீர்": "rainwater", "அடைப்பு": "blockage",
    # Streetlight
    "விளக்கு": "light", "தெருவிளக்கு": "streetlight", "எரியவில்லை": "not working", "இருட்டு": "dark",
    # Electricity
    "மின்சாரம்": "electricity", "மின்வயர்": "electric wire", "மின்கம்பம்": "electric pole", "தீப்பொறி": "spark",
    # Tamil transliterations (Tanglish)
    "thanni": "water", "kudineer": "drinking water", "kuzhai": "pipe", "kasivu": "leak",
    "pallam": "pothole", "salai": "road", "kuppai": "garbage", "saakadai": "drainage sewage",
    "velicham": "light", "eriyala": "not working", "minsaaram": "electricity", "current cut": "power outage"
}

def normalize_text(text: str) -> Tuple[str, str]:
    """
    Normalizes civic complaint text while preserving meaning.
    Supports English, Tamil Unicode, and Tanglish transliterations.
    Returns: (normalized_text, detected_language)
    """
    if not text:
        return "", "en"

    # Detect Tamil script
    is_tamil = bool(re.search(r'[\u0B80-\u0BFF]', text))
    lang = "ta" if is_tamil else "en"

    # Unicode normalization
    normalized = unicodedata.normalize('NFKC', text)
    
    # Lowercase for English / ASCII
    normalized = normalized.lower()

    # Expand common Tamil / Tanglish civic terms
    for term, expansion in TAMIL_KEYWORDS.items():
        normalized = re.sub(rf'\b{re.escape(term)}\b', f"{term} {expansion}", normalized, flags=re.IGNORECASE)

    # Clean redundant punctuation and excessive whitespace
    normalized = re.sub(r'[\r\n\t]+', ' ', normalized)
    normalized = re.sub(r'[^\w\s\u0B80-\u0BFF.,-]', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()

    return normalized, lang
