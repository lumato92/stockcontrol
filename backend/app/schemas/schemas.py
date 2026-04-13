from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from app.models.models import RoleEnum, MovementTypeEnum


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Users ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: Optional[str] = None
    role: RoleEnum = RoleEnum.viewer


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[RoleEnum] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    full_name: Optional[str]
    role: RoleEnum
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None


class CategoryOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


# ── Units ─────────────────────────────────────────────────────────────────────

class UnitOut(BaseModel):
    id: int
    name: str
    symbol: str

    class Config:
        from_attributes = True


# ── Products ──────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    sku: str
    name: str
    barcode: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    unit_id: int
    min_stock: Decimal = Decimal("0")
    cost_price: Optional[Decimal] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    barcode: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    unit_id: Optional[int] = None
    min_stock: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    is_active: Optional[bool] = None


class ProductOut(BaseModel):
    id: str
    sku: str
    barcode: Optional[str]
    name: str
    description: Optional[str]
    category: Optional[CategoryOut]
    unit: UnitOut
    min_stock: Decimal
    cost_price: Optional[Decimal]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Warehouses ────────────────────────────────────────────────────────────────

class WarehouseCreate(BaseModel):
    name: str
    address: Optional[str] = None


class WarehouseOut(BaseModel):
    id: str
    name: str
    address: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


# ── Stock ─────────────────────────────────────────────────────────────────────

class StockItem(BaseModel):
    product: ProductOut
    warehouse: WarehouseOut
    quantity: Decimal

    class Config:
        from_attributes = True


class ProductStockSummary(BaseModel):
    product: ProductOut
    total_quantity: Decimal
    by_warehouse: List[dict]
    status: str  # "normal" | "low" | "out"


# ── Movements ─────────────────────────────────────────────────────────────────

class MovementCreate(BaseModel):
    movement_type: MovementTypeEnum
    product_id: str
    from_warehouse_id: Optional[str] = None
    to_warehouse_id: Optional[str] = None
    quantity: Decimal
    reference_doc: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def qty_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("La cantidad debe ser mayor a cero")
        return v


class MovementOut(BaseModel):
    id: str
    movement_type: MovementTypeEnum
    product: ProductOut
    from_warehouse: Optional[WarehouseOut]
    to_warehouse: Optional[WarehouseOut]
    quantity: Decimal
    reference_doc: Optional[str]
    notes: Optional[str]
    performed_by_user: UserOut
    performed_at: datetime
    is_reversal: bool

    class Config:
        from_attributes = True


# ── Pagination ────────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    pages: int
    size: int
