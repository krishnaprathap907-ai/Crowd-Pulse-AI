# CrowdPulse TN — Architecture Specification

## 1. Executive Summary
**CrowdPulse TN** transforms individual citizen complaints across Tamil Nadu into collective civic intelligence. By coupling natural language processing, spatial DBSCAN distance grouping, and temporal rolling windows, the platform detects emerging civic crises (e.g. water pipeline ruptures, cluster road potholes) before they escalate into widespread public outages.

---

## 2. Core Architectural Components

### A. Data Ingestion & Security
- **Bilingual Normalization (`backend/app/ai/normalizer.py`)**: Handles Tamil Unicode script, Tanglish transliterations (e.g., `thanni`, `kudineer`, `pallam`, `kuppai`, `saakadai`), and English text.
- **Privacy Sanitization**: Strips image EXIF data before public storage; enforces data minimization on public maps.
- **Authentication**: JWT Bearer token authentication with bcrypt password hashing and Role-Based Access Control (`citizen`, `authority`, `staff`, `admin`).

### B. AI Understanding Engine
- **Category Classification (`backend/app/ai/classifier.py`)**: Scikit-Learn TF-IDF vectorizer + Logistic Regression trained on civic grievance datasets. Calibrated confidence scores with honest thresholds.
- **Semantic Similarity (`backend/app/ai/similarity.py`)**: Cosine similarity enhanced with civic domain concept clusters.
- **Multimodal Adapters (`backend/app/ai/multimodal.py`)**: Audio transcription & computer vision image analysis adapters with explicit advisory labeling.

### C. Geographical & Temporal Clustering
- **Haversine Distance (`backend/app/geo/clustering.py`)**: Computes great-circle distances in meters.
- **Temporal Windows (`backend/app/geo/temporal.py`)**: Evaluates complaint arrival velocity (reports/hour) in rolling 30m, 60m, and 180m windows.
- **Emerging Issue Detector (`backend/app/geo/detector.py`)**: 
  - Water Supply Rule: 4+ reports from 3+ distinct citizens within 600m and 180 minutes.
  - Generates Candidate Incident with full Explainability summary (reporters, radius, average similarity, uncertainty notes).
  - Deduplicates: prevents creating redundant incidents when new complaints arrive within active cluster boundaries.

### D. Workflow & State Transitions
```
Citizen Grievance Lodged 
  ↓
AI Classification & Geocoding
  ↓
Space-Time Clustering Check
  ↓
Candidate Incident Detected (AI advisory)
  ↓
Official Authority Verification (Verified or Rejected)
  ↓
Department Assignment (CMWSSB, GCC Roads, GCC SWM, TANGEDCO)
  ↓
Field Work Progress (In Progress)
  ↓
Closure & Broadcast Notification to all contributing citizens
```
