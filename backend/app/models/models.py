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


# ── Roles y usuarios ──────────────────────────────────────────────────────────

class RoleEnum(str, enum.Enum):
    admin = "admin"
    supervisor = "supervisor"
    operator = "operator"
    auditor = "auditor"
    viewer = "viewer"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email = Column(String(120), unique=True, nullable=False, index=True)
    username = Column(String(60), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(120))
    role = Column(Enum(RoleEnum), nullable=False, default=RoleEnum.viewer)
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    movements = relationship("StockMovement", back_populates="performed_by_user", foreign_keys="StockMovement.performed_by")
    audit_logs = relationship("AuditLog", back_populates="user")


# ── Catálogo ──────────────────────────────────────────────────────────────────

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(80), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    products = relationship("Product", back_populates="category")


class UnitOfMeasure(Base):
    __tablename__ = "units_of_measure"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(40), unique=True, nullable=False)
    symbol = Column(String(10), nullable=False)

    products = relationship("Product", back_populates="unit")


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    sku = Column(String(60), unique=True, nullable=False, index=True)
    barcode = Column(String(80), unique=True, nullable=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units_of_measure.id"), nullable=False)
    min_stock = Column(Numeric(12, 3), default=0)
    cost_price = Column(Numeric(12, 2), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, nullable=True)

    category = relationship("Category", back_populates="products")
    unit = relationship("UnitOfMeasure", back_populates="products")
    stock_entries = relationship("CurrentStock", back_populates="product")
    movements = relationship("StockMovement", back_populates="product")


# ── Depósitos ─────────────────────────────────────────────────────────────────

class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(100), nullable=False)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    stock_entries = relationship("CurrentStock", back_populates="warehouse")


# ── Stock actual ──────────────────────────────────────────────────────────────

class CurrentStock(Base):
    __tablename__ = "current_stock"

    product_id = Column(UUID(as_uuid=False), ForeignKey("products.id"), primary_key=True)
    warehouse_id = Column(UUID(as_uuid=False), ForeignKey("warehouses.id"), primary_key=True)
    quantity = Column(Numeric(12, 3), nullable=False, default=0)
    last_updated = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="stock_entries")
    warehouse = relationship("Warehouse", back_populates="stock_entries")


# ── Movimientos ───────────────────────────────────────────────────────────────

class MovementTypeEnum(str, enum.Enum):
    entrada = "entrada"
    salida = "salida"
    transferencia = "transferencia"
    ajuste = "ajuste"
    devolucion = "devolucion"


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    movement_type = Column(Enum(MovementTypeEnum), nullable=False)
    product_id = Column(UUID(as_uuid=False), ForeignKey("products.id"), nullable=False)
    from_warehouse_id = Column(UUID(as_uuid=False), ForeignKey("warehouses.id"), nullable=True)
    to_warehouse_id = Column(UUID(as_uuid=False), ForeignKey("warehouses.id"), nullable=True)
    quantity = Column(Numeric(12, 3), nullable=False)
    reference_doc = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    performed_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    performed_at = Column(DateTime, default=datetime.utcnow)
    is_reversal = Column(Boolean, default=False)
    reversed_movement_id = Column(UUID(as_uuid=False), ForeignKey("stock_movements.id"), nullable=True)

    product = relationship("Product", back_populates="movements")
    performed_by_user = relationship("User", back_populates="movements", foreign_keys=[performed_by])
    from_warehouse = relationship("Warehouse", foreign_keys=[from_warehouse_id])
    to_warehouse = relationship("Warehouse", foreign_keys=[to_warehouse_id])


# ── Auditoría ─────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    action = Column(String(40), nullable=False)
    table_name = Column(String(60), nullable=True)
    record_id = Column(String(60), nullable=True)
    description = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    occurred_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")
