import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    hash_token,
    verify_password,
)
from app.models.session import RefreshToken
from app.models.user import User
from app.schemas.token import RefreshTokenRequest, TokenResponse
from app.schemas.user import GoogleAuthRequest, UserLogin, UserRead, UserRegister

router = APIRouter()

# In-memory storage for desktop OAuth sessions waiting for browser completion
PENDING_DESKTOP_SESSIONS: Dict[str, Dict[str, Any]] = {}


def _issue_tokens_for_user(user: User, db: Session) -> TokenResponse:
    """Helper to generate access and refresh tokens, persist session in DB, and return response."""
    access_token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    refresh_token = create_refresh_token(subject=user.id)

    # Calculate expiry
    refresh_expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    # Store refresh token hash in database
    db_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        expires_at=refresh_expires_at,
        revoked=False,
    )
    db.add(db_token)
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserRead.model_validate(user),
    )


@router.post("/register", response_model=TokenResponse, summary="Manual User Registration (Email & Password)")
@router.post("/signup", response_model=TokenResponse, summary="Manual User Registration (Email & Password) - Alias")
def register_user(
    reg_data: UserRegister,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Creates a new user account with email and password, hashing the password and auto-issuing tokens."""
    email_clean = reg_data.email.strip().lower()
    if not email_clean or len(reg_data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long.",
        )

    existing_user = db.query(User).filter(User.email == email_clean).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists. Please sign in instead.",
        )

    # Hash password securely
    hashed_pwd = get_password_hash(reg_data.password)
    full_name_clean = reg_data.full_name.strip() if reg_data.full_name else email_clean.split("@")[0]

    # Generate bot avatar url
    avatar_url = f"https://api.dicebear.com/7.x/bottts/svg?seed={urllib.parse.quote(email_clean)}"

    new_user = User(
        email=email_clean,
        full_name=full_name_clean,
        avatar_url=avatar_url,
        hashed_password=hashed_pwd,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return _issue_tokens_for_user(new_user, db)


@router.post("/login", response_model=TokenResponse, summary="Manual User Login (Email & Password)")
def login_user(
    login_data: UserLogin,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticates a user with email and password, returning JWT access & refresh tokens."""
    email_clean = login_data.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account was registered using Google Sign-In. Please sign in with Google.",
        )

    if not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is deactivated. Please contact support.",
        )

    return _issue_tokens_for_user(user, db)


@router.get("/google/url", summary="Get Google OAuth Authorization URL")
def get_google_auth_url(
    redirect_uri: str = Query(default=None),
    state: Optional[str] = Query(default=None),
    is_desktop: bool = Query(default=True),
) -> Dict[str, Any]:
    """Generates the Google OAuth 2.0 authorization URL for browser login with account picker."""
    target_redirect_uri = redirect_uri or settings.GOOGLE_REDIRECT_URI

    # Clean up expired desktop sessions (> 10 minutes old)
    now = datetime.now(timezone.utc)
    expired = [
        k for k, v in PENDING_DESKTOP_SESSIONS.items()
        if (now - v.get("created_at", now)).total_seconds() > 600
    ]
    for k in expired:
        PENDING_DESKTOP_SESSIONS.pop(k, None)

    session_id = state
    if not session_id or is_desktop:
        session_id = f"desk_{secrets.token_urlsafe(24)}"
        PENDING_DESKTOP_SESSIONS[session_id] = {
            "status": "pending",
            "created_at": now,
        }

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": target_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account consent",
        "state": session_id,
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return {
        "url": url,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "session_id": session_id,
    }


@router.get("/google/check-desktop-session", summary="Check Desktop Browser OAuth Status")
def check_desktop_session(session_id: str = Query(..., description="Desktop session ID")) -> Dict[str, Any]:
    """Polled by the desktop application while user selects their Gmail in the external browser."""
    session = PENDING_DESKTOP_SESSIONS.get(session_id)
    if not session:
        return {"status": "not_found"}

    created_at = session.get("created_at")
    if created_at and (datetime.now(timezone.utc) - created_at).total_seconds() > 600:
        PENDING_DESKTOP_SESSIONS.pop(session_id, None)
        return {"status": "expired"}

    if session.get("status") == "authenticated":
        tokens = session.get("tokens")
        user = session.get("user")
        # Consume session after retrieval
        PENDING_DESKTOP_SESSIONS.pop(session_id, None)
        return {
            "status": "authenticated",
            "tokens": tokens,
            "user": user,
        }

    return {"status": "pending"}


@router.get("/google/callback", summary="Google OAuth 2.0 Callback")
async def google_oauth_callback(
    code: str = Query(..., description="Authorization code from Google"),
    state: Optional[str] = Query(default=None, description="Desktop session ID or CSRF state"),
    db: Session = Depends(get_db),
) -> Any:
    """Handles redirect from Google OAuth, exchanges code, and notifies desktop app or redirects to frontend."""
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(token_url, data=token_data)
        if token_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to exchange Google OAuth code: {token_resp.text}",
            )
        tokens = token_resp.json()
        google_access_token = tokens.get("access_token")

        userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        userinfo_resp = await client.get(
            userinfo_url,
            headers={"Authorization": f"Bearer {google_access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to retrieve Google user profile",
            )
        user_info = userinfo_resp.json()

    google_id = user_info.get("sub")
    email = user_info.get("email")
    full_name = user_info.get("name")
    avatar_url = user_info.get("picture")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google profile did not contain an email address",
        )

    # Find or create user
    user = db.query(User).filter((User.google_id == google_id) | (User.email == email)).first()
    if not user:
        user = User(
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
            google_id=google_id,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Update user profile with latest Google data
        user.google_id = google_id
        if full_name:
            user.full_name = full_name
        if avatar_url:
            user.avatar_url = avatar_url
        db.commit()
        db.refresh(user)

    token_bundle = _issue_tokens_for_user(user, db)

    # If this was initiated by the desktop app browser flow, store tokens for desktop polling
    if state and (state in PENDING_DESKTOP_SESSIONS or state.startswith("desk_")):
        PENDING_DESKTOP_SESSIONS[state] = {
            "status": "authenticated",
            "created_at": datetime.now(timezone.utc),
            "tokens": {
                "access_token": token_bundle.access_token,
                "refresh_token": token_bundle.refresh_token,
                "token_type": token_bundle.token_type,
                "expires_in": token_bundle.expires_in,
                "user": token_bundle.user.model_dump(),
            },
            "user": token_bundle.user.model_dump(),
        }

        user_display = email
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aivora - Signed in successfully</title>
  <style>
    body {{
      background: #090d16;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }}
    .card {{
      background: radial-gradient(120% 120% at 50% 0%, #1e1b4b 0%, #0f172a 60%, #090d16 100%);
      border: 1px solid rgba(139, 92, 246, 0.25);
      border-radius: 28px;
      padding: 44px 36px;
      max-width: 460px;
      width: 100%;
      text-align: center;
      box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(124, 58, 237, 0.15);
    }}
    .icon-wrapper {{
      width: 68px;
      height: 68px;
      margin: 0 auto 24px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #34d399;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 25px rgba(16, 185, 129, 0.25);
    }}
    h1 {{
      font-size: 22px;
      margin: 0 0 10px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(139, 92, 246, 0.18);
      border: 1px solid rgba(168, 85, 247, 0.35);
      color: #d8b4fe;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 20px;
    }}
    p {{
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
      margin: 0 0 28px;
    }}
    .highlight {{
      color: #e2e8f0;
      font-weight: 600;
    }}
    .footer-note {{
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 20px;
      margin-top: 10px;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrapper">
      <svg width="34" height="34" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
      </svg>
    </div>
    <div class="badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
      </svg>
      {user_display}
    </div>
    <h1>Signed in Successfully!</h1>
    <p>Authentication complete. Redirecting back to your <span class="highlight">Aivora Desktop Assistant</span>...</p>
    
    <a href="aivora://auth/callback?access_token={token_bundle.access_token}&refresh_token={token_bundle.refresh_token}&user_id={user.id}" 
       style="display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:12px 20px; border-radius:14px; background:linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); color:#fff; text-decoration:none; font-weight:600; font-size:14px; margin-bottom:16px;">
       Open Aivora Desktop App
    </a>

    <div class="footer-note">You can safely close this browser window and return to Aivora.</div>
  </div>
  <script>
    try {{
      window.location.href = "aivora://auth/callback?access_token={token_bundle.access_token}&refresh_token={token_bundle.refresh_token}&user_id={user.id}";
    }} catch(e) {{}}
    setTimeout(() => {{
      try {{ window.close(); }} catch(e) {{}}
    }}, 2500);
  </script>
</body>
</html>"""
        return HTMLResponse(content=html_content, status_code=200)

    # Redirect back to the frontend with token fragment
    redirect_target = (
        f"{settings.FRONTEND_URL}/#access_token={token_bundle.access_token}"
        f"&refresh_token={token_bundle.refresh_token}"
        f"&user_id={user.id}"
    )
    return RedirectResponse(url=redirect_target)


@router.post("/google/verify", response_model=TokenResponse, summary="Direct Google Auth Verification")
async def verify_google_auth(
    auth_request: GoogleAuthRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Verifies a Google ID token or code sent directly from the client (useful for popup or desktop)."""
    user_info: Dict[str, Any] = {}

    async with httpx.AsyncClient() as client:
        if auth_request.id_token:
            # Verify ID token via Google tokeninfo endpoint
            verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={auth_request.id_token}"
            resp = await client.get(verify_url)
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid Google ID token",
                )
            user_info = resp.json()

            # Verify audience matches client ID if configured
            aud = user_info.get("aud")
            if settings.GOOGLE_CLIENT_ID and aud != settings.GOOGLE_CLIENT_ID:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Google ID token audience mismatch",
                )

        elif auth_request.code:
            # Exchange code with custom redirect_uri
            token_url = "https://oauth2.googleapis.com/token"
            token_data = {
                "code": auth_request.code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": auth_request.redirect_uri or settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            }
            resp = await client.post(token_url, data=token_data)
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Google code exchange failed: {resp.text}",
                )
            tokens = resp.json()
            access_tok = tokens.get("access_token")

            userinfo_resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_tok}"},
            )
            if userinfo_resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to fetch Google user profile",
                )
            user_info = userinfo_resp.json()
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either id_token or code must be provided",
            )

    google_id = user_info.get("sub")
    email = user_info.get("email")
    full_name = user_info.get("name")
    avatar_url = user_info.get("picture")

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google profile did not contain an email address",
        )

    # Upsert user
    user = db.query(User).filter((User.google_id == google_id) | (User.email == email)).first()
    if not user:
        user = User(
            email=email,
            full_name=full_name,
            avatar_url=avatar_url,
            google_id=google_id,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.google_id = google_id
        if full_name:
            user.full_name = full_name
        if avatar_url:
            user.avatar_url = avatar_url
        db.commit()
        db.refresh(user)

    return _issue_tokens_for_user(user, db)


@router.post("/refresh", response_model=TokenResponse, summary="Refresh JWT Access Token")
def refresh_access_token(
    request: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Validates refresh token and issues a fresh access/refresh token pair."""
    try:
        payload = decode_token(request.refresh_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        ) from exc

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type for refresh",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token",
        )

    # Check database session record
    token_hash_val = hash_token(request.refresh_token)
    db_token = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == token_hash_val, RefreshToken.user_id == user_id)
        .first()
    )

    if not db_token or db_token.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked or is invalid",
        )

    if db_token.expires_at < datetime.now(timezone.utc):
        db_token.revoked = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account is deactivated",
        )

    # Revoke old refresh token (token rotation)
    db_token.revoked = True
    db.commit()

    return _issue_tokens_for_user(user, db)


@router.post("/logout", summary="Revoke Session & Logout")
def logout(
    request: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Revokes the given refresh token, effectively terminating the user session."""
    token_hash_val = hash_token(request.refresh_token)
    db_token = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash_val).first()
    if db_token:
        db_token.revoked = True
        db.commit()
    return {"message": "Session successfully revoked"}


@router.get("/me", response_model=UserRead, summary="Get Current Authenticated User")
def get_auth_me(current_user: User = Depends(get_current_user)) -> UserRead:
    """Returns profile information for the authenticated user."""
    return UserRead.model_validate(current_user)
