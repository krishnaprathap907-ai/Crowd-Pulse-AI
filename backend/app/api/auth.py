from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.security import verify_password, get_password_hash, create_access_token
from backend.app.models.models import User, UserProfile, UserRole, AuditLog
from backend.app.schemas.schemas import UserRegister, UserLogin, TokenResponse, UserOut
from backend.app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=TokenResponse)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    # Check if user already exists
    existing = db.query(User).filter(User.email == user_in.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )

    # Restrict self-registration of admin
    role = user_in.role if user_in.role in [UserRole.CITIZEN, UserRole.STAFF, UserRole.AUTHORITY] else UserRole.CITIZEN

    new_user = User(
        email=user_in.email.lower(),
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        role=role,
        phone=user_in.phone,
        is_active=True
    )
    db.add(new_user)
    db.flush()

    # Create profile
    profile = UserProfile(
        user_id=new_user.id,
        preferred_language=user_in.preferred_language or "en",
        neighborhood=user_in.neighborhood,
        district="Chennai"
    )
    db.add(profile)

    # Audit log
    db.add(AuditLog(
        user_id=new_user.id,
        action="USER_REGISTERED",
        entity_type="user",
        entity_id=new_user.id
    ))

    db.commit()
    db.refresh(new_user)

    access_token = create_access_token({"sub": str(new_user.id), "email": new_user.email, "role": new_user.role})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": new_user.role,
            "preferred_language": profile.preferred_language,
            "neighborhood": profile.neighborhood
        }
    }

@router.post("/login", response_model=TokenResponse)
def login(login_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_in.email.lower()).first()
    if not user or not verify_password(login_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is currently deactivated."
        )

    access_token = create_access_token({"sub": str(user.id), "email": user.email, "role": user.role})

    # Audit log
    db.add(AuditLog(
        user_id=user.id,
        action="USER_LOGIN",
        entity_type="user",
        entity_id=user.id
    ))
    db.commit()

    pref_lang = user.profile.preferred_language if user.profile else "en"
    neighborhood = user.profile.neighborhood if user.profile else ""

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "preferred_language": pref_lang,
            "neighborhood": neighborhood
        }
    }

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    pref_lang = current_user.profile.preferred_language if current_user.profile else "en"
    neighborhood = current_user.profile.neighborhood if current_user.profile else ""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "phone": current_user.phone,
        "is_active": current_user.is_active,
        "preferred_language": pref_lang,
        "neighborhood": neighborhood
    }

@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Successfully logged out"}
