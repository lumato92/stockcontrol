from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func
from typing import Optional
from datetime import datetime
from app.db.session import get_db
from app.models.models import Product, CurrentStock, User, AuditLog
from app.schemas.schemas import ProductCreate, ProductUpdate, ProductOut, PaginatedResponse
from app.api.v1.deps import get_current_user, require_operator_or_above, require_admin_supervisor
from decimal import Decimal

router = APIRouter()


def get_product_or_404(product_id: str, db: Session) -> Product:
    product = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.unit),
    ).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product


@router.get("/", response_model=PaginatedResponse)
def list_products(
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(None),
    status: Optional[str] = Query(None),  # "low" | "out"
    warehouse_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.unit),
    )

    if search:
        q = q.filter(or_(
            Product.name.ilike(f"%{search}%"),
            Product.sku.ilike(f"%{search}%"),
            Product.barcode.ilike(f"%{search}%"),
        ))
    if category_id:
        q = q.filter(Product.category_id == category_id)
    if is_active is not None:
        q = q.filter(Product.is_active == is_active)
    else:
        q = q.filter(Product.is_active == True)

    # Filtros de stock
    if status == "out":
        stock_sub = db.query(CurrentStock.product_id).filter(
            CurrentStock.quantity > 0
        )
        q = q.filter(~Product.id.in_(stock_sub))
    elif status == "low":
        low_ids = db.query(CurrentStock.product_id).filter(
            CurrentStock.quantity > 0,
            CurrentStock.quantity <= func.cast(Product.min_stock, Decimal)
        )
        q = q.filter(Product.id.in_(
            db.query(CurrentStock.product_id)
            .join(Product, Product.id == CurrentStock.product_id)
            .filter(CurrentStock.quantity > 0, CurrentStock.quantity <= Product.min_stock)
        ))

    total = q.count()
    items = q.order_by(Product.name).offset((page - 1) * size).limit(size).all()

    return PaginatedResponse(
        items=[ProductOut.model_validate(p) for p in items],
        total=total,
        page=page,
        pages=(total + size - 1) // size or 1,
        size=size,
    )


@router.get("/search", response_model=ProductOut)
def search_by_barcode(
    barcode: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.unit),
    ).filter(Product.barcode == barcode, Product.is_active == True).first()

    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado con ese código de barras")
    return product


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_product_or_404(product_id, db)


@router.post("/", response_model=ProductOut, status_code=201)
def create_product(
    body: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
):
    if db.query(Product).filter(Product.sku == body.sku).first():
        raise HTTPException(status_code=400, detail="Ya existe un producto con ese SKU")
    if body.barcode and db.query(Product).filter(Product.barcode == body.barcode).first():
        raise HTTPException(status_code=400, detail="Ya existe un producto con ese código de barras")

    product = Product(**body.model_dump(), created_by=current_user.id)
    db.add(product)

    log = AuditLog(user_id=current_user.id, action="CREATE", table_name="products",
                   description=f"Producto creado: {body.name} ({body.sku})")
    db.add(log)
    db.commit()
    db.refresh(product)
    return get_product_or_404(product.id, db)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: str,
    body: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
):
    product = get_product_or_404(product_id, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    product.updated_at = datetime.utcnow()

    log = AuditLog(user_id=current_user.id, action="UPDATE", table_name="products",
                   record_id=product_id, description=f"Producto actualizado: {product.name}")
    db.add(log)
    db.commit()
    return get_product_or_404(product_id, db)


@router.delete("/{product_id}")
def deactivate_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_supervisor),
):
    product = get_product_or_404(product_id, db)
    product.is_active = False
    product.updated_at = datetime.utcnow()

    log = AuditLog(user_id=current_user.id, action="DEACTIVATE", table_name="products",
                   record_id=product_id, description=f"Producto desactivado: {product.name}")
    db.add(log)
    db.commit()
    return {"message": "Producto desactivado"}
