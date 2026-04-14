from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.db.session import get_db
from app.core.security import hash_password
from app.core.email import send_welcome
from app.models.models import User, Category, UnitOfMeasure, AuditLog, UserSession
from app.schemas.schemas import UserCreate, UserUpdate, UserOut, CategoryCreate, CategoryOut, UnitOut
from app.api.v1.deps import get_current_user, require_admin, require_admin_supervisor
 
router_users      = APIRouter()
router_categories = APIRouter()
router_units      = APIRouter()
 
 
# ── USERS ─────────────────────────────────────────────────────────────────────
 
@router_users.get("/", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return db.query(User).order_by(User.full_name).all()
 
 
@router_users.post("/", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese email")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese nombre de usuario")
 
    user = User(
        email                = body.email,
        username             = body.username,
        hashed_password      = hash_password(body.password),
        full_name            = body.full_name,
        role                 = body.role,
        must_change_password = body.must_change_password,
    )
    db.add(user)
    log = AuditLog(user_id=current_user.id, action="CREATE", table_name="users",
                   description=f"Usuario creado: {body.email} ({body.role})")
    db.add(log)
    db.commit()
    db.refresh(user)
 
    try:
        send_welcome(user.email, user.full_name or '', user.username)
    except Exception as e:
        print(f"[ERROR] Mail de bienvenida no enviado: {e}")
 
    return user
 
 
@router_users.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id and body.is_active == False:
        raise HTTPException(status_code=400, detail="No podés desactivarte a vos mismo")
 
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
 
    log = AuditLog(user_id=current_user.id, action="UPDATE", table_name="users",
                   record_id=user_id, description=f"Usuario modificado: {user.email}")
    db.add(log)
    db.commit()
    db.refresh(user)
    return user
 
 
@router_users.post("/{user_id}/unlock")
def unlock_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Desbloquear manualmente un usuario bloqueado por intentos fallidos."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
 
    user.failed_login_attempts = 0
    user.locked_until = None
    log = AuditLog(user_id=current_user.id, action="UNLOCK", table_name="users",
                   record_id=user_id, description=f"Usuario desbloqueado manualmente: {user.email}")
    db.add(log)
    db.commit()
    return {"message": "Usuario desbloqueado"}
 
 
@router_users.get("/{user_id}/sessions")
def user_sessions(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Ver sesiones activas de un usuario (solo admin)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
 
    sessions = db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.revoked == False,
    ).order_by(UserSession.last_used.desc()).all()
 
    return [
        {
            "id":         s.id,
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "created_at": s.created_at,
            "last_used":  s.last_used,
        }
        for s in sessions
    ]
 
 
@router_users.post("/{user_id}/revoke-all-sessions")
def revoke_all_sessions(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Revocar todas las sesiones activas de un usuario (útil cuando sale de la empresa)."""
    count = db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.revoked == False,
    ).update({"revoked": True, "revoked_at": datetime.utcnow()})
 
    log = AuditLog(user_id=current_user.id, action="REVOKE_SESSIONS", table_name="users",
                   record_id=user_id, description=f"Sesiones revocadas: {count}")
    db.add(log)
    db.commit()
    return {"message": f"{count} sesiones revocadas"}
 
 
# ── CATEGORIES ────────────────────────────────────────────────────────────────
 
@router_categories.get("/", response_model=list[CategoryOut])
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Category).filter(Category.is_active == True).order_by(Category.name).all()
 
 
@router_categories.post("/", response_model=CategoryOut, status_code=201)
def create_category(
    body: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_supervisor),
):
    if db.query(Category).filter(Category.name == body.name).first():
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")
    cat = Category(**body.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat
 
 
# ── UNITS ─────────────────────────────────────────────────────────────────────
 
@router_units.get("/", response_model=list[UnitOut])
def list_units(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(UnitOfMeasure).order_by(UnitOfMeasure.name).all()
 