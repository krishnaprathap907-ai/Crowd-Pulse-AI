import pytest
from datetime import datetime, timezone
from backend.app.ai.normalizer import normalize_text
from backend.app.ai.classifier import classifier
from backend.app.ai.similarity import similarity_engine
from backend.app.geo.clustering import haversine_distance, calculate_centroid_and_radius
from backend.app.geo.temporal import filter_reports_by_time_window, calculate_arrival_rate
from backend.app.core.security import get_password_hash, verify_password, create_access_token, decode_access_token

def test_password_hashing():
    pw = "SuperSecure123!"
    hashed = get_password_hash(pw)
    assert verify_password(pw, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

def test_jwt_token_creation_and_decoding():
    data = {"sub": "42", "role": "authority"}
    token = create_access_token(data)
    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["sub"] == "42"
    assert decoded["role"] == "authority"

def test_text_normalization_tamil_and_english():
    raw_en = "   LOW WATER PRESSURE in T. Nagar pipeline!!  "
    norm_en, lang_en = normalize_text(raw_en)
    assert "water" in norm_en
    assert "pressure" in norm_en
    assert lang_en == "en"

    raw_ta = "எங்கள் பகுதியில் குடிநீர் வரவில்லை"
    norm_ta, lang_ta = normalize_text(raw_ta)
    assert "water" in norm_ta or "குடிநீர்" in norm_ta
    assert lang_ta == "ta"

def test_ai_category_classification():
    # Water Supply text
    water_res = classifier.classify("pipeline burst leaking drinking water onto street")
    assert water_res["predicted_category_id"] == 1
    assert water_res["confidence_score"] > 0.4

    # Pothole Road text
    road_res = classifier.classify("dangerous deep pothole on main road causing accidents")
    assert road_res["predicted_category_id"] == 2
    assert road_res["confidence_score"] > 0.4

    # Garbage text
    waste_res = classifier.classify("overflowing garbage bin rotting waste uncollected")
    assert waste_res["predicted_category_id"] == 3
    assert waste_res["confidence_score"] > 0.4

def test_semantic_similarity():
    text_1 = "No drinking water supply since morning"
    text_2 = "Drinking water pressure is zero, pipes are completely dry"
    text_3 = "Deep pothole in the road near traffic light"

    sim_related = similarity_engine.compute_similarity(text_1, text_2)
    sim_unrelated = similarity_engine.compute_similarity(text_1, text_3)

    assert sim_related > sim_unrelated
    assert sim_related >= 0.25

def test_haversine_distance():
    # T. Nagar South Boag Road to Usman Road (~180m)
    dist = haversine_distance(13.0392, 80.2335, 13.0401, 80.2348)
    assert 100.0 < dist < 300.0

    # Chennai to Coimbatore (~430 km)
    dist_cbe = haversine_distance(13.0827, 80.2707, 11.0168, 76.9558)
    assert 400000.0 < dist_cbe < 550000.0

def test_centroid_and_radius():
    points = [
        (13.0392, 80.2335),
        (13.0401, 80.2348),
        (13.0415, 80.2329)
    ]
    lat, lon, radius = calculate_centroid_and_radius(points)
    assert 13.038 < lat < 13.045
    assert 80.230 < lon < 80.238
    assert radius >= 200.0

if __name__ == "__main__":
    print("Running CrowdPulse TN Test Suite...", flush=True)
    test_password_hashing()
    print("[PASS] test_password_hashing", flush=True)
    test_jwt_token_creation_and_decoding()
    print("[PASS] test_jwt_token_creation_and_decoding", flush=True)
    test_text_normalization_tamil_and_english()
    print("[PASS] test_text_normalization_tamil_and_english", flush=True)
    test_ai_category_classification()
    print("[PASS] test_ai_category_classification", flush=True)
    test_semantic_similarity()
    print("[PASS] test_semantic_similarity", flush=True)
    test_haversine_distance()
    print("[PASS] test_haversine_distance", flush=True)
    test_centroid_and_radius()
    print("[PASS] test_centroid_and_radius", flush=True)
    print("\nALL 7 CORE SYSTEM TESTS PASSED SUCCESSFULLY! (100% SUCCESS RATE)", flush=True)

