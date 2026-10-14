from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from backend.app.core.database import get_db
from backend.app.api.deps import get_optional_current_user
from backend.app.models.models import User, CopilotChat
from backend.app.services.copilot_service import CopilotService

router = APIRouter(prefix="/copilot", tags=["Civic Copilot"])

class CopilotChatRequest(BaseModel):
    query: str
    role_override: Optional[str] = None

@router.post("/chat")
def chat_with_copilot(
    payload: CopilotChatRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Submits a query to the AI Civic Copilot grounded in database state.
    """
    if not payload.query or not payload.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    user_id = current_user.id if current_user else None
    role = payload.role_override or (current_user.role if current_user else "citizen")

    result = CopilotService.process_query(
        db=db,
        query=payload.query.strip(),
        user_id=user_id,
        user_role=role
    )
    return result

@router.get("/quick-prompts")
def get_quick_prompts(
    role: str = Query("citizen"),
    current_user: Optional[User] = Depends(get_optional_current_user)
):
    """
    Returns suggested queries for the given user role.
    """
    active_role = role
    if current_user and current_user.role in ["authority", "staff", "admin"]:
        active_role = current_user.role
    prompts = CopilotService.get_quick_prompts(active_role)
    return {"role": active_role, "prompts": prompts}

@router.get("/history")
def get_chat_history(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
    limit: int = 15
):
    """
    Returns recent copilot conversations.
    """
    query = db.query(CopilotChat)
    if current_user:
        query = query.filter((CopilotChat.user_id == current_user.id) | (CopilotChat.user_id == None))
    chats = query.order_by(CopilotChat.created_at.desc()).limit(limit).all()

    return [{
        "id": c.id,
        "query": c.query,
        "response": c.response,
        "role": c.role,
        "sources": c.sources_json or [],
        "created_at": c.created_at.isoformat() if c.created_at else None
    } for c in reversed(chats)]
