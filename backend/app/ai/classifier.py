import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from backend.app.ai.normalizer import normalize_text

CIVIC_TRAINING_DATA = [
    # Water supply (category_id: 1)
    ("no drinking water supply since morning in our street", 1),
    ("drinking water pipeline burst and leaking clean water", 1),
    ("low water pressure from metro water pipelines", 1),
    ("water shortage in t nagar residential colony", 1),
    ("contaminated muddy water coming from municipal taps", 1),
    ("kudineer supply stopped without prior notice", 1),
    ("tanker water supply delayed, no water for cooking or drinking", 1),
    ("main water distribution line broken near junction", 1),
    ("குடிநீர் குழாய் உடைந்து தண்ணீர் வீணாக போகிறது", 1),
    ("எங்கள் பகுதியில் குடிநீர் வரவில்லை தண்ணீர் தட்டுப்பாடு", 1),
    ("water pipe leak underground creating puddle", 1),

    # Roads (category_id: 2)
    ("huge pothole on main road causing bike accidents", 2),
    ("broken road surface and uneven tarmac after metro work", 2),
    ("damaged pedestrian footpath slabs causing tripping hazard", 2),
    ("deep crater in middle of road near school gate", 2),
    ("road dug up for cable laying and left open", 2),
    ("salai pallam dangerous pothole on bus route", 2),
    ("manhole cover broken on road vehicle tire trapped", 2),
    ("சாலையில் பெரிய பள்ளம் விபத்து அபாயம்", 2),
    ("நடைபாதை கற்கள் உடைந்து நடக்க முடியவில்லை", 2),

    # Waste management (category_id: 3)
    ("garbage accumulation near dustbin overflowing for 4 days", 3),
    ("missed municipal waste collection garbage rotting", 3),
    ("illegal garbage dumping on corner lot severe stench", 3),
    ("kuppai thotti full of plastic waste and food waste", 3),
    ("dead animal carcass lying on roadside uncollected", 3),
    ("commercial waste dumped into empty plot causing mosquitoes", 3),
    ("குப்பை அள்ளாமல் பல நாட்களாக துர்நாற்றம் அடிக்கிறது", 3),
    ("தெருவோரம் குப்பை மலை போல் குவிந்துள்ளது", 3),

    # Flooding & Drainage (category_id: 4)
    ("storm water drain blocked with silt rainwater overflowing", 4),
    ("sewage water backflow into residential street manhole", 4),
    ("severe waterlogging on main street after rain water knee deep", 4),
    ("saakadai drainage overflow open sewer stink", 4),
    ("rainwater stagnant for 3 days no outlet road submerged", 4),
    ("underground sewage pipe clogged dirty water leaking", 4),
    ("மழைநீர் வடிகால் அடைப்பு சாக்கடை நீர் தெருவில் ஓடுகிறது", 4),
    ("மழை பெய்தால் தெரு முழுவதும் வெள்ளம் தேங்குகிறது", 4),

    # Streetlights (category_id: 5)
    ("streetlights not working on entire avenue complete pitch dark", 5),
    ("flickering street lamp pole number 42", 5),
    ("broken streetlight bracket dangling dangerously", 5),
    ("velicham illa streetlights off for past 1 week safety hazard", 5),
    ("sodium lamp fused dark stretch near bus stop", 5),
    ("தெருவிளக்கு எரியவில்லை இருட்டாக உள்ளது", 5),
    ("மின் விளக்கு பழுது இரவு நேரத்தில் அச்சம்", 5),

    # Electricity Hazards (category_id: 6)
    ("live electric wire snapped and hanging close to pavement", 6),
    ("electric transformer sparking and emitting loud buzzing noise", 6),
    ("tneb junction box open live wires exposed near children play area", 6),
    ("damaged electric pole leaning at 45 degrees", 6),
    ("short circuit spark from cable line fire risk", 6),
    ("மின் கம்பி அறுந்து விழுந்து கிடக்கிறது ஆபத்து", 6),
    ("மின்மாற்றியில் தீப்பொறி பறக்கிறது", 6),

    # Public Infrastructure (category_id: 7)
    ("broken park bench and damaged swing in corporation park", 7),
    ("bus shelter roof blown away during storm passengers exposed", 7),
    ("public toilet locked and sanitation taps broken", 7),
    ("community hall boundary wall cracked and collapsing", 7),
    ("corporation school boundary railing stolen", 7),
    ("பொது பூங்கா உபகரணங்கள் உடைந்த நிலையில் உள்ளன", 7),
    ("பேருந்து நிழற்குடை சேதமடைந்துள்ளது", 7),
]

class CivicClassifier:
    def __init__(self):
        self.model_version = "cp-civic-nlp-v2.1"
        self._init_model()

    def _init_model(self):
        texts = [normalize_text(item[0])[0] for item in CIVIC_TRAINING_DATA]
        labels = [item[1] for item in CIVIC_TRAINING_DATA]
        
        self.pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
            ('clf', LogisticRegression(C=2.0, max_iter=200, class_weight='balanced'))
        ])
        self.pipeline.fit(texts, labels)

    def classify(self, text: str, user_selected_category_id: Optional[int] = None) -> Dict[str, Any]:
        """
        Classifies report text into category with confidence score and method.
        """
        start_time = time.time()
        norm_text, lang = normalize_text(text)
        
        if not norm_text or len(norm_text) < 4:
            return {
                "predicted_category_id": user_selected_category_id or 8,
                "confidence_score": 0.5,
                "model_version": self.model_version,
                "language": lang,
                "processing_time_ms": int((time.time() - start_time) * 1000),
                "is_needs_review": False
            }

        try:
            probas = self.pipeline.predict_proba([norm_text])[0]
            classes = self.pipeline.classes_
            best_idx = np.argmax(probas)
            predicted_id = int(classes[best_idx])
            raw_confidence = float(probas[best_idx])
            num_classes = len(classes)
            
            # Calibrate confidence relative to random baseline (1/K)
            # A raw probability of 0.35 in a 7-class system is 2.5x random baseline
            uniform_prob = 1.0 / max(1, num_classes)
            calibrated = min(0.98, max(0.20, (raw_confidence - uniform_prob) / (1.0 - uniform_prob) * 0.6 + 0.4))
            confidence = round(calibrated if raw_confidence > uniform_prob else raw_confidence, 3)

            # Apply thresholding
            is_needs_review = confidence < 0.40

            # If user selected a valid category and confidence is borderline, we weight appropriately
            final_cat_id = predicted_id if confidence >= 0.45 else (user_selected_category_id or predicted_id)

            return {
                "predicted_category_id": final_cat_id,
                "confidence_score": confidence,
                "model_version": self.model_version,
                "language": lang,
                "processing_time_ms": int((time.time() - start_time) * 1000),
                "is_needs_review": is_needs_review
            }
        except Exception:
            return {
                "predicted_category_id": user_selected_category_id or 1,
                "confidence_score": 0.5,
                "model_version": f"{self.model_version}-fallback",
                "language": lang,
                "processing_time_ms": int((time.time() - start_time) * 1000),
                "is_needs_review": False
            }

classifier = CivicClassifier()
