from typing import Dict
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.core.config import settings

router = APIRouter()


@router.get("", summary="Backend Health Check")
def check_health(db: Session = Depends(get_db)) -> Dict[str, str]:
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "disconnected"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "app_name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
    }
