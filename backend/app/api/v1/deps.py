from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import decode_token
from app.models.models import User, RoleEnum

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado o inactivo")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [RoleEnum.admin]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere rol Admin")
    return current_user


def require_admin_supervisor(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [RoleEnum.admin, RoleEnum.supervisor]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere rol Admin o Supervisor")
    return current_user


def require_operator_or_above(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [RoleEnum.admin, RoleEnum.supervisor, RoleEnum.operator]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere rol Operador o superior")
    return current_user


def require_auditor_or_above(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [RoleEnum.admin, RoleEnum.supervisor, RoleEnum.auditor]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere rol Auditor o superior")
    return current_user
