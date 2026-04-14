import random
import hashlib
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List

from app.db.session import get_db
from app.core.security import verify_password, hash_password, create_access_token, create_refresh_token, decode_token
from app.core.config import settings
from app.core.email import send_reset_code, send_welcome
from app.models.models import User, AuditLog, PasswordResetCode, UserSession
from app.schemas.schemas import LoginRequest, TokenResponse, RefreshRequest, UserOut
from app.api.v1.deps import get_current_user

router = APIRouter()


# ── Schemas locales ───────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class SessionOut(BaseModel):
    id: str
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime
    last_used: datetime
    revoked: bool

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_code() -> str:
    return str(random.randint(100000, 999999))


def _check_lockout(user: User) -> None:
    if user.locked_until and user.locked_until > datetime.utcnow():
        remaining = int((user.locked_until - datetime.utcnow()).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cuenta bloqueada por intentos fallidos. Intentá en {remaining} minutos."
        )


def _register_session(db: Session, user: User, refresh_token: str, request: Request) -> None:
    session = UserSession(
        user_id    = user.id,
        token_hash = _hash_token(refresh_token),
        ip_address = request.client.host if request.client else None,
        user_agent = request.headers.get("user-agent"),
    )
    db.add(session)


def _require_not_locked(user: User) -> None:
    """Usado en deps — si must_change_password está activo solo permite ciertos endpoints."""
    pass  # se maneja en cada endpoint


# ── LOGIN ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        (User.username == body.username) | (User.email == body.username)
    ).first()

    # Usuario no existe — no revelar si existe o no
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")

    _check_lockout(user)

    if not verify_password(body.password, user.hashed_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
            user.locked_until = datetime.utcnow() + timedelta(minutes=settings.LOCKOUT_MINUTES)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cuenta bloqueada por {settings.MAX_LOGIN_ATTEMPTS} intentos fallidos. "
                       f"Intentá en {settings.LOCKOUT_MINUTES} minutos."
            )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    # Login exitoso — resetear contador
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.utcnow()

    access_token  = create_access_token({"sub": user.id})
    refresh_token = create_refresh_token({"sub": user.id})

    _register_session(db, user, refresh_token, request)

    log = AuditLog(
        user_id=user.id, action="LOGIN",
        description=f"Login exitoso desde {request.client.host if request.client else 'unknown'}",
        ip_address=request.client.host if request.client else None,
    )
    db.add(log)
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        must_change_password=user.must_change_password,
    )


# ── REFRESH ───────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token inválido")

    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    # Validar que la sesión existe y no fue revocada
    token_hash = _hash_token(body.refresh_token)
    session = db.query(UserSession).filter(
        UserSession.token_hash == token_hash,
        UserSession.user_id == user.id,
        UserSession.revoked == False,
    ).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida o revocada")

    # Rotar — revocar sesión vieja, crear nueva
    session.revoked = True
    session.revoked_at = datetime.utcnow()

    new_access  = create_access_token({"sub": user.id})
    new_refresh = create_refresh_token({"sub": user.id})

    _register_session(db, user, new_refresh, request)
    db.commit()

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        must_change_password=user.must_change_password,
    )


# ── ME ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── LOGOUT ────────────────────────────────────────────────────────────────────

@router.post("/logout")
def logout(body: RefreshRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    token_hash = _hash_token(body.refresh_token)
    session = db.query(UserSession).filter(
        UserSession.token_hash == token_hash,
        UserSession.user_id == current_user.id,
    ).first()
    if session:
        session.revoked = True
        session.revoked_at = datetime.utcnow()
        db.commit()
    return {"message": "Sesión cerrada correctamente"}


# ── FORGOT PASSWORD ───────────────────────────────────────────────────────────

@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()

    # Siempre responder igual — no revelar si el email existe
    if not user:
        return {"message": "Si el email existe, recibirás un código en breve"}

    # Invalidar códigos anteriores
    db.query(PasswordResetCode).filter(
        PasswordResetCode.user_id == user.id,
        PasswordResetCode.used == False,
    ).update({"used": True})

    code = _generate_code()
    reset = PasswordResetCode(
        user_id    = user.id,
        code_hash  = hash_password(code),
        expires_at = datetime.utcnow() + timedelta(minutes=settings.RESET_CODE_EXPIRE_MINUTES),
    )
    db.add(reset)
    db.commit()

    try:
        send_reset_code(user.email, user.full_name or user.username, code)
    except Exception as e:
        # No exponer el error al cliente
        print(f"[ERROR] Mail no enviado: {e}")

    return {"message": "Si el email existe, recibirás un código en breve"}


# ── RESET PASSWORD ────────────────────────────────────────────────────────────

@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=400, detail="Código inválido o expirado")

    # Buscar código válido más reciente
    reset = db.query(PasswordResetCode).filter(
        PasswordResetCode.user_id == user.id,
        PasswordResetCode.used == False,
        PasswordResetCode.expires_at > datetime.utcnow(),
    ).order_by(PasswordResetCode.created_at.desc()).first()

    if not reset or not verify_password(body.code, reset.code_hash):
        raise HTTPException(status_code=400, detail="Código inválido o expirado")

    user.hashed_password = hash_password(body.new_password)
    user.must_change_password = False
    user.failed_login_attempts = 0
    user.locked_until = None
    reset.used = True

    log = AuditLog(user_id=user.id, action="RESET_PASSWORD",
                   description="Contraseña restablecida via código")
    db.add(log)
    db.commit()

    return {"message": "Contraseña actualizada correctamente"}


# ── CHANGE PASSWORD ───────────────────────────────────────────────────────────

@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")

    current_user.hashed_password = hash_password(body.new_password)
    current_user.must_change_password = False

    log = AuditLog(user_id=current_user.id, action="CHANGE_PASSWORD",
                   description="Contraseña cambiada por el usuario")
    db.add(log)
    db.commit()

    return {"message": "Contraseña actualizada correctamente"}


# ── SESSIONS ──────────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=List[SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.revoked == False,
    ).order_by(UserSession.last_used.desc()).all()


@router.post("/sessions/{session_id}/revoke")
def revoke_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(UserSession).filter(
        UserSession.id == session_id,
        UserSession.user_id == current_user.id,  # solo las propias
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    session.revoked = True
    session.revoked_at = datetime.utcnow()
    db.commit()

    return {"message": "Sesión revocada"}