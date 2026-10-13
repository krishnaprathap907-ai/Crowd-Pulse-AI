import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.core.database import Base, engine
from scripts.seed_demo import run_seed

def reset_and_seed():
    print("Dropping all existing tables...")
    Base.metadata.drop_all(bind=engine)
    print("Recreating database tables and baseline demo data...")
    run_seed()
    print("Reset completed successfully!")

if __name__ == "__main__":
    reset_and_seed()
