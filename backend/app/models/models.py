import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, Integer, Numeric, Text,
    ForeignKey, DateTime, Enum, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base
import enum


def gen_uuid():
    return str(uuid.uuid4())


# ── Enums ─────────────────────────────────────────────────────────────────────

class RoleEnum(str, enum.Enum):
    admin = "admin"
    supervisor = "supervisor"
    operator = "operator"
    auditor = "auditor"
    viewer = "viewer"


class DispatchRuleEnum(str, enum.Enum):
    FIFO = "FIFO"
    FEFO = "FEFO"
    LIFO = "LIFO"


class LocationTypeEnum(str, enum.Enum):
    zone  = "zone"
    aisle = "aisle"
    rack  = "rack"
    level = "level"
    cell  = "cell"


class MovementTypeEnum(str, enum.Enum):
    entrada       = "entrada"
    salida        = "salida"
    transferencia = "transferencia"
    ajuste        = "ajuste"
    devolucion    = "devolucion"


# ── Usuarios ──────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email           = Column(String(120), unique=True, nullable=False, index=True)
    username        = Column(String(60), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name       = Column(String(120))
    role            = Column(Enum(RoleEnum), nullable=False, default=RoleEnum.viewer)
    is_active       = Column(Boolean, default=True)
    last_login      = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    must_change_password  = Column(Boolean, default=False)
    failed_login_attempts = Column(Integer, default=0)
    locked_until          = Column(DateTime, nullable=True)

    movements  = relationship("StockMovement", back_populates="performed_by_user", foreign_keys="StockMovement.performed_by")
    audit_logs = relationship("AuditLog", back_populates="user")
    reset_codes = relationship("PasswordResetCode", back_populates="user")
    sessions    = relationship("UserSession", back_populates="user")


# ── Catálogo ──────────────────────────────────────────────────────────────────

class Category(Base):
    __tablename__ = "categories"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(String(80), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    products = relationship("Product", back_populates="category")


class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"

    id     = Column(Integer, primary_key=True, autoincrement=True)
    name   = Column(String(40), unique=True, nullable=False)
    symbol = Column(String(10), nullable=False)

    products = relationship("Product", back_populates="unit")


class Product(Base):
    __tablename__ = "products"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    sku         = Column(String(60), unique=True, nullable=False, index=True)
    barcode     = Column(String(80), unique=True, nullable=True, index=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    unit_id     = Column(Integer, ForeignKey("units_of_measure.id"), nullable=False)
    min_stock   = Column(Numeric(12, 3), default=0)
    cost_price  = Column(Numeric(12, 2), nullable=True)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    created_by  = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    updated_at  = Column(DateTime, nullable=True)

    # Dimensiones físicas
    weight_kg         = Column(Numeric(10, 3), nullable=True)
    length_cm         = Column(Numeric(8, 2), nullable=True)
    width_cm          = Column(Numeric(8, 2), nullable=True)
    height_cm         = Column(Numeric(8, 2), nullable=True)

    # Trazabilidad
    track_batches     = Column(Boolean, default=False)
    track_serial      = Column(Boolean, default=False)
    has_expiry        = Column(Boolean, default=False)
    expiry_alert_days = Column(Integer, nullable=True)

    # Restricciones de almacenamiento
    requires_cold  = Column(Boolean, default=False)
    is_fragile     = Column(Boolean, default=False)
    is_stackable   = Column(Boolean, default=True)
    is_hazardous   = Column(Boolean, default=False)

    # Regla de despacho
    dispatch_rule = Column(Enum(DispatchRuleEnum), default=DispatchRuleEnum.FIFO)

    category         = relationship("Category", back_populates="products")
    unit             = relationship("UnitOfMeasure", back_populates="products")
    stock_entries    = relationship("CurrentStock", back_populates="product")
    movements        = relationship("StockMovement", back_populates="product")
    unit_conversions = relationship("ProductUnitConversion", back_populates="product")


# ── Depósitos y ubicaciones ───────────────────────────────────────────────────

class Warehouse(Base):
    __tablename__ = "warehouses"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name       = Column(String(100), nullable=False)
    address    = Column(Text, nullable=True)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    locations = relationship("WarehouseLocation", back_populates="warehouse")


class WarehouseLocation(Base):
    __tablename__ = "warehouse_locations"
    __table_args__ = (UniqueConstraint("warehouse_id", "code"),)

    id            = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    warehouse_id  = Column(UUID(as_uuid=False), ForeignKey("warehouses.id"), nullable=False)
    parent_id     = Column(UUID(as_uuid=False), ForeignKey("warehouse_locations.id"), nullable=True)
    location_type = Column(Enum(LocationTypeEnum), nullable=False)
    code          = Column(String(40), nullable=False)
    name          = Column(String(100), nullable=True)
    max_weight_kg    = Column(Numeric(10, 2), nullable=True)
    allows_cold      = Column(Boolean, default=False)
    allows_hazardous = Column(Boolean, default=False)
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime, default=datetime.utcnow)

    warehouse     = relationship("Warehouse", back_populates="locations")
    parent        = relationship("WarehouseLocation", remote_side="WarehouseLocation.id", back_populates="children")
    children      = relationship("WarehouseLocation", back_populates="parent")
    stock_entries = relationship("CurrentStock", back_populates="location")


# ── Stock actual ──────────────────────────────────────────────────────────────

class CurrentStock(Base):
    __tablename__ = "current_stock"

    product_id   = Column(UUID(as_uuid=False), ForeignKey("products.id"), primary_key=True)
    location_id  = Column(UUID(as_uuid=False), ForeignKey("warehouse_locations.id"), primary_key=True)
    quantity     = Column(Numeric(12, 3), nullable=False, default=0)
    last_updated = Column(DateTime, default=datetime.utcnow)

    product  = relationship("Product", back_populates="stock_entries")
    location = relationship("WarehouseLocation", back_populates="stock_entries")


# ── Movimientos ───────────────────────────────────────────────────────────────

class StockMovement(Base):
    __tablename__ = "stock_movements"

    id                   = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    movement_type        = Column(Enum(MovementTypeEnum), nullable=False)
    product_id           = Column(UUID(as_uuid=False), ForeignKey("products.id"), nullable=False)
    from_location_id     = Column(UUID(as_uuid=False), ForeignKey("warehouse_locations.id"), nullable=True)
    to_location_id       = Column(UUID(as_uuid=False), ForeignKey("warehouse_locations.id"), nullable=True)
    quantity             = Column(Numeric(12, 3), nullable=False)
    reference_doc        = Column(String(100), nullable=True)
    notes                = Column(Text, nullable=True)
    performed_by         = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    performed_at         = Column(DateTime, default=datetime.utcnow)
    is_reversal          = Column(Boolean, default=False)
    reversed_movement_id = Column(UUID(as_uuid=False), ForeignKey("stock_movements.id"), nullable=True)

    product           = relationship("Product", back_populates="movements")
    performed_by_user = relationship("User", back_populates="movements", foreign_keys=[performed_by])
    from_location     = relationship("WarehouseLocation", foreign_keys=[from_location_id])
    to_location       = relationship("WarehouseLocation", foreign_keys=[to_location_id])


# ── Conversiones de unidad ────────────────────────────────────────────────────

class ProductUnitConversion(Base):
    __tablename__ = "product_unit_conversions"
    __table_args__ = (UniqueConstraint("product_id", "from_unit_id", "to_unit_id"),)

    id           = Column(Integer, primary_key=True, autoincrement=True)
    product_id   = Column(UUID(as_uuid=False), ForeignKey("products.id"), nullable=False)
    from_unit_id = Column(Integer, ForeignKey("units_of_measure.id"), nullable=False)
    to_unit_id   = Column(Integer, ForeignKey("units_of_measure.id"), nullable=False)
    factor       = Column(Numeric(14, 6), nullable=False)
    is_active    = Column(Boolean, default=True)

    product   = relationship("Product", back_populates="unit_conversions")
    from_unit = relationship("UnitOfMeasure", foreign_keys=[from_unit_id])
    to_unit   = relationship("UnitOfMeasure", foreign_keys=[to_unit_id])


# ── Auditoría ─────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_log"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    action      = Column(String(40), nullable=False)
    table_name  = Column(String(60), nullable=True)
    record_id   = Column(String(60), nullable=True)
    description = Column(Text, nullable=True)
    ip_address  = Column(String(45), nullable=True)
    occurred_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")



class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"
 
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    code_hash  = Column(String(255), nullable=False)   # bcrypt del código de 6 dígitos
    expires_at = Column(DateTime, nullable=False)
    used       = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
 
    user = relationship("User", back_populates="reset_codes")
 
 
class UserSession(Base):
    __tablename__ = "user_sessions"
 
    id           = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id      = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    token_hash   = Column(String(255), nullable=False, index=True)  # SHA-256 del refresh token
    ip_address   = Column(String(45), nullable=True)
    user_agent   = Column(Text, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    last_used    = Column(DateTime, default=datetime.utcnow)
    revoked      = Column(Boolean, default=False)
    revoked_at   = Column(DateTime, nullable=True)
 
    user = relationship("User", back_populates="sessions")