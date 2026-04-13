from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import datetime
from decimal import Decimal
from app.db.session import get_db
from app.models.models import (
    StockMovement, CurrentStock, Product, Warehouse, User, AuditLog,
    MovementTypeEnum
)
from app.schemas.schemas import (
    MovementCreate, MovementOut, WarehouseCreate, WarehouseOut,
    ProductStockSummary, PaginatedResponse
)
from app.api.v1.deps import get_current_user, require_operator_or_above, require_admin_supervisor

router_movements = APIRouter()
router_stock = APIRouter()
router_warehouses = APIRouter()


# ── WAREHOUSES ────────────────────────────────────────────────────────────────

@router_warehouses.get("/", response_model=list[WarehouseOut])
def list_warehouses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Warehouse).filter(Warehouse.is_active == True).order_by(Warehouse.name).all()


@router_warehouses.post("/", response_model=WarehouseOut, status_code=201)
def create_warehouse(
    body: WarehouseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_supervisor),
):
    wh = Warehouse(**body.model_dump())
    db.add(wh)
    log = AuditLog(user_id=current_user.id, action="CREATE", table_name="warehouses",
                   description=f"Depósito creado: {body.name}")
    db.add(log)
    db.commit()
    db.refresh(wh)
    return wh


@router_warehouses.put("/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(
    warehouse_id: str,
    body: WarehouseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_supervisor),
):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")
    wh.name = body.name
    wh.address = body.address
    db.commit()
    db.refresh(wh)
    return wh


# ── STOCK ─────────────────────────────────────────────────────────────────────

@router_stock.get("/")
def get_stock(
    warehouse_id: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(CurrentStock).options(
        joinedload(CurrentStock.product).joinedload(Product.category),
        joinedload(CurrentStock.product).joinedload(Product.unit),
        joinedload(CurrentStock.warehouse),
    )

    if warehouse_id:
        q = q.filter(CurrentStock.warehouse_id == warehouse_id)
    if category_id:
        q = q.join(Product).filter(Product.category_id == category_id)
    if status == "low":
        q = q.join(Product).filter(
            CurrentStock.quantity > 0,
            CurrentStock.quantity <= Product.min_stock
        )
    elif status == "out":
        q = q.filter(CurrentStock.quantity == 0)

    entries = q.all()

    result = []
    for e in entries:
        p = e.product
        total = float(e.quantity)
        min_s = float(p.min_stock)
        st = "out" if total == 0 else ("low" if min_s > 0 and total <= min_s else "normal")
        result.append({
            "product_id": p.id,
            "product_name": p.name,
            "sku": p.sku,
            "barcode": p.barcode,
            "category": p.category.name if p.category else None,
            "unit": p.unit.symbol,
            "warehouse_id": e.warehouse_id,
            "warehouse_name": e.warehouse.name,
            "quantity": total,
            "min_stock": min_s,
            "status": st,
        })

    return result


@router_stock.get("/summary")
def stock_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_products = db.query(Product).filter(Product.is_active == True).count()
    total_warehouses = db.query(Warehouse).filter(Warehouse.is_active == True).count()

    low_stock = db.query(func.count()).select_from(CurrentStock).join(Product).filter(
        CurrentStock.quantity > 0,
        CurrentStock.quantity <= Product.min_stock,
        Product.min_stock > 0
    ).scalar()

    out_of_stock = db.query(func.count()).select_from(CurrentStock).filter(
        CurrentStock.quantity == 0
    ).scalar()

    products_no_stock = db.query(Product).filter(Product.is_active == True).outerjoin(
        CurrentStock, CurrentStock.product_id == Product.id
    ).filter(CurrentStock.product_id == None).count()

    return {
        "total_products": total_products,
        "total_warehouses": total_warehouses,
        "low_stock_count": low_stock,
        "out_of_stock_count": out_of_stock + products_no_stock,
    }


# ── MOVEMENTS ─────────────────────────────────────────────────────────────────

def _load_movement(movement_id: str, db: Session) -> StockMovement:
    m = db.query(StockMovement).options(
        joinedload(StockMovement.product).joinedload(Product.category),
        joinedload(StockMovement.product).joinedload(Product.unit),
        joinedload(StockMovement.performed_by_user),
        joinedload(StockMovement.from_warehouse),
        joinedload(StockMovement.to_warehouse),
    ).filter(StockMovement.id == movement_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return m


def _update_stock(db: Session, product_id: str, warehouse_id: str, delta: Decimal):
    """Actualiza o crea el stock para un producto en un depósito."""
    entry = db.query(CurrentStock).filter(
        CurrentStock.product_id == product_id,
        CurrentStock.warehouse_id == warehouse_id,
    ).first()

    if entry:
        new_qty = Decimal(str(entry.quantity)) + delta
        if new_qty < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente. Disponible: {entry.quantity}"
            )
        entry.quantity = new_qty
        entry.last_updated = datetime.utcnow()
    else:
        if delta < 0:
            raise HTTPException(status_code=400, detail="No hay stock registrado en este depósito")
        db.add(CurrentStock(
            product_id=product_id,
            warehouse_id=warehouse_id,
            quantity=delta,
        ))


@router_movements.post("/", response_model=MovementOut, status_code=201)
def create_movement(
    body: MovementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
):
    # Validar producto
    product = db.query(Product).filter(Product.id == body.product_id, Product.is_active == True).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # Validar depósitos según tipo
    if body.movement_type == MovementTypeEnum.entrada:
        if not body.to_warehouse_id:
            raise HTTPException(status_code=400, detail="Entrada requiere depósito destino")
        if not db.query(Warehouse).filter(Warehouse.id == body.to_warehouse_id).first():
            raise HTTPException(status_code=404, detail="Depósito destino no encontrado")
        _update_stock(db, body.product_id, body.to_warehouse_id, body.quantity)

    elif body.movement_type == MovementTypeEnum.salida:
        if not body.from_warehouse_id:
            raise HTTPException(status_code=400, detail="Salida requiere depósito origen")
        _update_stock(db, body.product_id, body.from_warehouse_id, -body.quantity)

    elif body.movement_type == MovementTypeEnum.transferencia:
        if not body.from_warehouse_id or not body.to_warehouse_id:
            raise HTTPException(status_code=400, detail="Transferencia requiere origen y destino")
        if body.from_warehouse_id == body.to_warehouse_id:
            raise HTTPException(status_code=400, detail="Origen y destino no pueden ser el mismo")
        _update_stock(db, body.product_id, body.from_warehouse_id, -body.quantity)
        _update_stock(db, body.product_id, body.to_warehouse_id, body.quantity)

    elif body.movement_type == MovementTypeEnum.ajuste:
        if not body.to_warehouse_id:
            raise HTTPException(status_code=400, detail="Ajuste requiere depósito")
        if not body.notes:
            raise HTTPException(status_code=400, detail="Los ajustes requieren una nota explicativa")
        # El ajuste puede ser positivo o negativo pero la quantity es siempre positiva
        # Se usa la nota para indicar el sentido
        _update_stock(db, body.product_id, body.to_warehouse_id, body.quantity)

    movement = StockMovement(
        **body.model_dump(),
        performed_by=current_user.id,
    )
    db.add(movement)

    log = AuditLog(
        user_id=current_user.id, action="MOVEMENT",
        table_name="stock_movements",
        description=f"{body.movement_type.value} de {body.quantity} {product.name}",
    )
    db.add(log)
    db.commit()
    return _load_movement(movement.id, db)


@router_movements.get("/", response_model=PaginatedResponse)
def list_movements(
    product_id: Optional[str] = Query(None),
    warehouse_id: Optional[str] = Query(None),
    movement_type: Optional[MovementTypeEnum] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(StockMovement).options(
        joinedload(StockMovement.product).joinedload(Product.category),
        joinedload(StockMovement.product).joinedload(Product.unit),
        joinedload(StockMovement.performed_by_user),
        joinedload(StockMovement.from_warehouse),
        joinedload(StockMovement.to_warehouse),
    )

    if product_id:
        q = q.filter(StockMovement.product_id == product_id)
    if warehouse_id:
        q = q.filter(
            (StockMovement.from_warehouse_id == warehouse_id) |
            (StockMovement.to_warehouse_id == warehouse_id)
        )
    if movement_type:
        q = q.filter(StockMovement.movement_type == movement_type)

    total = q.count()
    items = q.order_by(StockMovement.performed_at.desc()).offset((page - 1) * size).limit(size).all()

    return PaginatedResponse(
        items=[MovementOut.model_validate(m) for m in items],
        total=total,
        page=page,
        pages=(total + size - 1) // size or 1,
        size=size,
    )


@router_movements.post("/{movement_id}/reverse", response_model=MovementOut)
def reverse_movement(
    movement_id: str,
    notes: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_supervisor),
):
    original = _load_movement(movement_id, db)
    if original.is_reversal:
        raise HTTPException(status_code=400, detail="No se puede revertir una reversión")

    # Crear movimiento inverso
    reversal_type = {
        MovementTypeEnum.entrada: MovementTypeEnum.salida,
        MovementTypeEnum.salida: MovementTypeEnum.entrada,
        MovementTypeEnum.transferencia: MovementTypeEnum.transferencia,
        MovementTypeEnum.ajuste: MovementTypeEnum.ajuste,
    }.get(original.movement_type, original.movement_type)

    reversal = StockMovement(
        movement_type=reversal_type,
        product_id=original.product_id,
        from_warehouse_id=original.to_warehouse_id,
        to_warehouse_id=original.from_warehouse_id,
        quantity=original.quantity,
        notes=f"REVERSIÓN de movimiento {movement_id}. Motivo: {notes}",
        performed_by=current_user.id,
        is_reversal=True,
        reversed_movement_id=movement_id,
    )

    # Actualizar stock
    if reversal_type == MovementTypeEnum.salida and original.to_warehouse_id:
        _update_stock(db, original.product_id, original.to_warehouse_id, -original.quantity)
    elif reversal_type == MovementTypeEnum.entrada and original.from_warehouse_id:
        _update_stock(db, original.product_id, original.from_warehouse_id, original.quantity)
    elif reversal_type == MovementTypeEnum.transferencia:
        _update_stock(db, original.product_id, original.to_warehouse_id, -original.quantity)
        _update_stock(db, original.product_id, original.from_warehouse_id, original.quantity)

    db.add(reversal)
    log = AuditLog(user_id=current_user.id, action="REVERSE", table_name="stock_movements",
                   record_id=movement_id, description=f"Reversión aplicada. Motivo: {notes}")
    db.add(log)
    db.commit()
    return _load_movement(reversal.id, db)
