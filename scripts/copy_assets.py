import os
import shutil

src_dir = r"C:\Users\krishnaprathap\.gemini\antigravity-ide\brain\ac9485ad-251f-48c4-a003-bfd56afe2200"
dest_dir = r"C:\Users\krishnaprathap\OneDrive\Desktop\CrowdPulse AI\frontend\static\images"

os.makedirs(dest_dir, exist_ok=True)

before_src = os.path.join(src_dir, "velachery_before_1791897865108.jpg")
after_src = os.path.join(src_dir, "velachery_after_1791897887624.jpg")

if os.path.exists(before_src):
    shutil.copy2(before_src, os.path.join(dest_dir, "velachery_before.jpg"))
    print("Copied velachery_before.jpg")

if os.path.exists(after_src):
    shutil.copy2(after_src, os.path.join(dest_dir, "velachery_after.jpg"))
    print("Copied velachery_after.jpg")

# Also run seed demo if needed
from scripts.seed_demo import run_seed
run_seed()
