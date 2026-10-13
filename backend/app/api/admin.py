from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.models.models import (
    User, Department, CivicCategory, ApplicationSetting, AuditLog, UserRole
)
from backend.app.schemas.schemas import UserOut, CategoryOut, DepartmentOut
from backend.app.api.deps import require_admin, get_current_user

router = APIRouter(prefix="/admin", tags=["Administration"])

@router.get("/users", response_model=List[UserOut])
def get_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    users = db.query(User).order_by(User.created_at.desc()).limit(100).all()
    return users

@router.patch("/users/{id}/role")
def update_user_role(
    id: int,
    role: str = Body(..., embed=True),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    valid_roles = [UserRole.CITIZEN, UserRole.STAFF, UserRole.AUTHORITY, UserRole.ADMIN]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Choose from: {valid_roles}")

    target_user = db.query(User).filter(User.id == id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    old_role = target_user.role
    target_user.role = role

    db.add(AuditLog(
        user_id=current_user.id,
        action="USER_ROLE_UPDATED",
        entity_type="user",
        entity_id=target_user.id,
        details_json={"old_role": old_role, "new_role": role}
    ))
    db.commit()
    return {"message": f"User {target_user.email} updated to role {role}", "role": role}

@router.get("/settings")
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    settings_records = db.query(ApplicationSetting).all()
    res = {s.key: s.value for s in settings_records}
    if not res:
        # Defaults
        res = {
            "DETECTION_DISTANCE_METERS": "600.0",
            "DETECTION_TIME_WINDOW_MINUTES": "180",
            "DETECTION_MIN_WATER_REPORTS": "4",
            "DETECTION_MIN_DEFAULT_REPORTS": "4",
            "DEMO_MODE_ACTIVE": "true",
            "AUTO_NOTIFY_CITIZENS": "true"
        }
    return res

@router.patch("/settings")
def update_settings(
    updates: Dict[str, str],
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    for key, val in updates.items():
        record = db.query(ApplicationSetting).filter(ApplicationSetting.key == key).first()
        if record:
            record.value = str(val)
        else:
            db.add(ApplicationSetting(key=key, value=str(val), description="Configurable setting"))

    db.add(AuditLog(
        user_id=current_user.id,
        action="SETTINGS_UPDATED",
        entity_type="settings",
        details_json=updates
    ))
    db.commit()
    return {"message": "Settings saved successfully", "settings": updates}

@router.get("/departments", response_model=List[DepartmentOut])
def get_departments(db: Session = Depends(get_db)):
    return db.query(Department).filter(Department.is_active == True).all()

@router.get("/categories", response_model=List[CategoryOut])
def get_categories(db: Session = Depends(get_db)):
    return db.query(CivicCategory).filter(CivicCategory.is_active == True).all()
