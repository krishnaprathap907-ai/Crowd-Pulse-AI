import os
import shutil

IS_VERCEL = bool(os.getenv("VERCEL"))

# On Vercel serverless, root filesystem is read-only, writable dir is /tmp
DEFAULT_DB = "sqlite:////tmp/crowdpulse.db" if IS_VERCEL else "sqlite:///./crowdpulse.db"
DEFAULT_UPLOAD = "/tmp/uploads" if IS_VERCEL else "./frontend/uploads"

# If running on Vercel, copy existing crowdpulse.db to /tmp if available
if IS_VERCEL:
    src_db = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "crowdpulse.db"))
    dest_db = "/tmp/crowdpulse.db"
    if os.path.exists(src_db) and not os.path.exists(dest_db):
        try:
            shutil.copyfile(src_db, dest_db)
        except Exception as e:
            print(f"Notice preparing Vercel /tmp db: {e}")

class Settings:
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "CrowdPulse TN")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "crowdpulse_tn_super_secret_jwt_key_change_in_production_2026_xyz")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    DATABASE_URL: str = os.getenv("DATABASE_URL", DEFAULT_DB)
    
    # AI and Clustering Settings
    DETECTION_DISTANCE_METERS: float = float(os.getenv("DETECTION_DISTANCE_METERS", "600.0"))
    DETECTION_TIME_WINDOW_MINUTES: int = int(os.getenv("DETECTION_TIME_WINDOW_MINUTES", "180"))
    DETECTION_MIN_REPORTS_DEFAULT: int = int(os.getenv("DETECTION_MIN_REPORTS_DEFAULT", "4"))
    DETECTION_MIN_WATER_REPORTS: int = int(os.getenv("DETECTION_MIN_WATER_REPORTS", "4"))
    DETECTION_MIN_UNIQUE_REPORTERS: int = int(os.getenv("DETECTION_MIN_UNIQUE_REPORTERS", "3"))
    DETECTION_SIMILARITY_THRESHOLD: float = float(os.getenv("DETECTION_SIMILARITY_THRESHOLD", "0.35"))
    
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", DEFAULT_UPLOAD)
    MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "15"))
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))

settings = Settings()

