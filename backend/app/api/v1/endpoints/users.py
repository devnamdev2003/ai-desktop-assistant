from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.models.preference import UserPreference
from app.models.session import RefreshToken
from app.models.user import User
from app.schemas.user import UserPreferenceRead, UserPreferenceUpdate, UserRead, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserRead, summary="Get Current User Profile")
def read_current_user(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.patch("/me", response_model=UserRead, summary="Update Current User Profile")
def update_current_user(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserRead:
    if update_data.full_name is not None:
        current_user.full_name = update_data.full_name.strip()
    if update_data.email is not None:
        new_email = str(update_data.email).strip().lower()
        existing = db.query(User).filter(User.email == new_email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="This email address is already in use by another account.")
        current_user.email = new_email
    if update_data.avatar_url is not None:
        current_user.avatar_url = update_data.avatar_url.strip()

    db.commit()
    db.refresh(current_user)
    return UserRead.model_validate(current_user)


@router.get("/me/sessions", summary="List Active Sessions")
def list_user_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    tokens = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == current_user.id, RefreshToken.revoked.is_(False))
        .all()
    )
    return {
        "active_sessions_count": len(tokens),
        "sessions": [
            {
                "id": t.id,
                "created_at": t.created_at,
                "expires_at": t.expires_at,
            }
            for t in tokens
        ],
    }


@router.post("/me/sessions/logout-all", summary="Logout All Active Sessions")
def logout_all_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked.is_(False)
    ).update({"revoked": True})
    db.commit()
    return {"message": "All active login sessions have been revoked."}


@router.get("/me/preferences", response_model=UserPreferenceRead, summary="Get User Preferences from Database")
def get_user_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPreferenceRead:
    pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    if not pref:
        # Create default preferences row if not exists
        pref = UserPreference(
            user_id=current_user.id,
            sound_enabled=True,
            custom_instruction="",
        )
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return UserPreferenceRead.model_validate(pref)


@router.put("/me/preferences", response_model=UserPreferenceRead, summary="Save User Preferences into Database")
def update_user_preferences(
    pref_data: UserPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPreferenceRead:
    pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    if not pref:
        pref = UserPreference(user_id=current_user.id)
        db.add(pref)

    if pref_data.sound_enabled is not None:
        pref.sound_enabled = pref_data.sound_enabled
    if pref_data.custom_instruction is not None:
        pref.custom_instruction = pref_data.custom_instruction.strip()

    db.commit()
    db.refresh(pref)
    return UserPreferenceRead.model_validate(pref)

