# CrowdPulse TN 🌊
> **"Detect Early. Act Together."**
> An AI-powered civic issue detection and early-warning platform for Tamil Nadu.

CrowdPulse TN transforms individual citizen grievances into collective civic intelligence. Instead of treating complaints in isolation, the platform analyzes semantics, geographical proximity, and temporal velocity to detect emerging civic emergencies (such as municipal water-supply interruptions, road crater clusters, and drainage backups).

---

## 🏛️ Key Features

- **Collective Issue Detection**: Groups individual complaints into single actionable incidents with transparent explainability.
- **Bilingual Tamil & English AI Pipeline**: Supports Tamil Unicode (`குடிநீர்`, `சாக்கடை`, `பள்ளம்`), Tanglish (`thanni`, `kuppai`, `pallam`), and English.
- **Space-Time Clustering**: DBSCAN / Haversine distance matrix with rolling 30m, 60m, and 180m time windows.
- **Role-Based Access Control**:
  - **Citizen**: Submit complaints, upload photos/voice, track updates, withdraw reports.
  - **Authority Officer**: Review candidate clusters, inspect evidence, verify/reject, assign departments.
  - **Department Staff**: Update progress, submit resolution notes.
  - **Administrator**: Configure detection thresholds and manage users.
- **Interactive OpenStreetMap**: Visualizes verified incidents, candidate circles, and report points.
- **Zero-Fake Data Integrity**: Clear distinction between simulated demonstration records, AI candidate clusters, and officially verified incidents.

---

## ⚡ Quick Start (Local Setup)

### 1. Requirements
- Python 3.10+ (Tested on Python 3.14)

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Initialize & Seed Demo Database
```bash
python scripts/seed_demo.py
```

### 4. Start the Application Server
```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your web browser.

---

## 🔑 Demonstration Accounts

All demonstration accounts use the password: `DemoPass123!`

| Role | Email | Name | Locality |
| :--- | :--- | :--- | :--- |
| **Citizen** | `citizen@crowdpulse.tn` | Karthik Subramanian | T. Nagar |
| **Authority Officer** | `officer@crowdpulse.tn` | Dr. S. Radhakrishnan, IAS | Ripon Building |
| **Field Staff** | `staff.roads@crowdpulse.tn` | Murugesan R (Junior Engineer) | Zone 10 Office |
| **Administrator** | `admin@crowdpulse.tn` | System Administrator | IT Operations |

*Note: The web interface includes a quick demo role switcher in the top navigation bar for immediate testing.*

---

## 🧪 Automated Testing

Run the full system test suite:
```bash
python -m backend.app.tests.test_crowdpulse
```

Verified tests:
- `test_password_hashing`: Secure bcrypt password hashing and verification.
- `test_jwt_token_creation_and_decoding`: JWT token payload integrity.
- `test_text_normalization_tamil_and_english`: Bilingual normalizer with Tamil dictionary expansion.
- `test_ai_category_classification`: Scikit-Learn TF-IDF classifier with calibrated probabilities.
- `test_semantic_similarity`: Domain-boosted cosine similarity.
- `test_haversine_distance`: Accurate geospatial distance calculation in meters.
- `test_centroid_and_radius`: Cluster center and coverage boundary calculation.

---

## 🐳 Docker Deployment

Run with Docker Compose:
```bash
docker compose up -d
```
The application will be live at `http://localhost:8000`.

---

## 📚 API Endpoints Overview

- `POST /api/auth/register` & `POST /api/auth/login`
- `POST /api/reports` & `GET /api/reports`
- `GET /api/incidents` & `GET /api/incidents/{id}`
- `POST /api/incidents/{id}/verify` (Verify or Reject candidate)
- `POST /api/incidents/{id}/assign` (Assign responsible department)
- `PATCH /api/incidents/{id}/status` (Progress workflow to closed)
- `GET /api/analytics/overview` & `GET /api/analytics/export-csv`
- `GET /api/map/incidents` & `GET /api/map/reports`
- `POST /api/demo/seed` & `POST /api/demo/reset`

Interactive Swagger API docs available at: **`http://127.0.0.1:8000/docs`**

---

## ⚖️ Responsible AI & Privacy
- Image EXIF metadata is stripped before storage to prevent exposing private GPS coordinates.
- Anonymous citizen reporting minimizes public personal data exposure.
- AI detections are always tagged as advisory `CANDIDATE` until officially verified by authorized municipal officers.
