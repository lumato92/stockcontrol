from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import datetime, date
from decimal import Decimal
import os
from jinja2 import Environment, FileSystemLoader
import weasyprint
from app.db.session import get_db
from app.models.models import (
    StockMovement, CurrentStock, Product, Warehouse, WarehouseLocation,
    User, AuditLog, MovementTypeEnum, LocationTypeEnum
)
from app.schemas.schemas import (
    MovementCreate, MovementOut, WarehouseCreate, WarehouseOut,
    PaginatedResponse
)
from app.api.v1.deps import get_current_user, require_operator_or_above, require_admin_supervisor

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "templates")
_jinja_env = Environment(loader=FileSystemLoader(_TEMPLATES_DIR), autoescape=True)

_MOVEMENT_LABELS = {
    "entrada":       "Entrada",
    "salida":        "Salida",
    "transferencia": "Transferencia",
    "ajuste":        "Ajuste",
    "devolucion":    "Devolución",
}
_MOVEMENT_COLORS = {
    "entrada":       "#166534",
    "salida":        "#991b1b",
    "transferencia": "#1e40af",
    "ajuste":        "#92400e",
    "devolucion":    "#6b21a8",
}

router_movements = APIRouter()
router_stock     = APIRouter()
router_warehouses = APIRouter()


# ── WAREHOUSES ────────────────────────────────────────────────────────────────

@router_warehouses.get("/", response_model=list[WarehouseOut])
def list_warehouses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Warehouse).filter(Warehouse.is_active == True).order_by(Warehouse.name).all()


@router_warehouses.get("/{warehouse_id}", response_model=WarehouseOut)
def get_warehouse(
    warehouse_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Depósito no encontrado")
    return wh


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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_cell_or_404(location_id: str, db: Session) -> WarehouseLocation:
    loc = db.query(WarehouseLocation).filter(
        WarehouseLocation.id == location_id,
        WarehouseLocation.is_active == True,
    ).first()
    if not loc:
        raise HTTPException(status_code=404, detail=f"Ubicación {location_id} no encontrada")
    if loc.location_type != LocationTypeEnum.cell:
        raise HTTPException(
            status_code=400,
            detail=f"La ubicación '{loc.code}' es de tipo '{loc.location_type.value}'. Solo las celdas (cell) pueden recibir stock."
        )
    return loc


def _update_stock(db: Session, product_id: str, location_id: str, delta: Decimal):
    entry = db.query(CurrentStock).filter(
        CurrentStock.product_id == product_id,
        CurrentStock.location_id == location_id,
    ).first()

    if entry:
        new_qty = Decimal(str(entry.quantity)) + delta
        if new_qty < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente en esta ubicación. Disponible: {entry.quantity}"
            )
        entry.quantity = new_qty
        entry.last_updated = datetime.utcnow()
    else:
        if delta < 0:
            raise HTTPException(status_code=400, detail="No hay stock registrado en esta ubicación")
        db.add(CurrentStock(
            product_id=product_id,
            location_id=location_id,
            quantity=delta,
        ))


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
        joinedload(CurrentStock.location).joinedload(WarehouseLocation.warehouse),
    )

    if warehouse_id:
        q = q.join(WarehouseLocation).filter(WarehouseLocation.warehouse_id == warehouse_id)
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
        loc = e.location
        total = float(e.quantity)
        min_s = float(p.min_stock)
        st = "out" if total == 0 else ("low" if min_s > 0 and total <= min_s else "normal")
        result.append({
            "product_id":     p.id,
            "product_name":   p.name,
            "sku":            p.sku,
            "barcode":        p.barcode,
            "category":       p.category.name if p.category else None,
            "unit":           p.unit.symbol,
            "location_id":    loc.id,
            "location_code":  loc.code,
            "location_name":  loc.name,
            "warehouse_id":   loc.warehouse_id,
            "warehouse_name": loc.warehouse.name,
            "quantity":       total,
            "min_stock":      min_s,
            "status":         st,
        })

    return result


@router_stock.get("/summary")
def stock_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_products   = db.query(Product).filter(Product.is_active == True).count()
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
        "total_products":    total_products,
        "total_warehouses":  total_warehouses,
        "low_stock_count":   low_stock,
        "out_of_stock_count": out_of_stock + products_no_stock,
    }


# ── MOVEMENTS ─────────────────────────────────────────────────────────────────

def _load_movement(movement_id: str, db: Session) -> StockMovement:
    m = db.query(StockMovement).options(
        joinedload(StockMovement.product).joinedload(Product.category),
        joinedload(StockMovement.product).joinedload(Product.unit),
        joinedload(StockMovement.performed_by_user),
        joinedload(StockMovement.from_location).joinedload(WarehouseLocation.warehouse),
        joinedload(StockMovement.to_location).joinedload(WarehouseLocation.warehouse),
    ).filter(StockMovement.id == movement_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return m


@router_movements.post("/", response_model=MovementOut, status_code=201)
def create_movement(
    body: MovementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator_or_above),
):
    product = db.query(Product).filter(Product.id == body.product_id, Product.is_active == True).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    if body.movement_type == MovementTypeEnum.entrada:
        if not body.to_location_id:
            raise HTTPException(status_code=400, detail="Entrada requiere ubicación destino")
        _get_cell_or_404(body.to_location_id, db)
        _update_stock(db, body.product_id, body.to_location_id, body.quantity)

    elif body.movement_type == MovementTypeEnum.salida:
        if not body.from_location_id:
            raise HTTPException(status_code=400, detail="Salida requiere ubicación origen")
        _get_cell_or_404(body.from_location_id, db)
        _update_stock(db, body.product_id, body.from_location_id, -body.quantity)

    elif body.movement_type == MovementTypeEnum.transferencia:
        if not body.from_location_id or not body.to_location_id:
            raise HTTPException(status_code=400, detail="Transferencia requiere origen y destino")
        if body.from_location_id == body.to_location_id:
            raise HTTPException(status_code=400, detail="Origen y destino no pueden ser la misma ubicación")
        _get_cell_or_404(body.from_location_id, db)
        _get_cell_or_404(body.to_location_id, db)
        _update_stock(db, body.product_id, body.from_location_id, -body.quantity)
        _update_stock(db, body.product_id, body.to_location_id, body.quantity)

    elif body.movement_type == MovementTypeEnum.ajuste:
        if not body.to_location_id:
            raise HTTPException(status_code=400, detail="Ajuste requiere ubicación")
        if not body.notes:
            raise HTTPException(status_code=400, detail="Los ajustes requieren una nota explicativa")
        _get_cell_or_404(body.to_location_id, db)
        _update_stock(db, body.product_id, body.to_location_id, body.quantity)

    movement = StockMovement(**body.model_dump(), performed_by=current_user.id)
    db.add(movement)
    log = AuditLog(
        user_id=current_user.id, action="MOVEMENT",
        table_name="stock_movements",
        description=f"{body.movement_type.value} de {body.quantity} {product.name}",
    )
    db.add(log)
    db.commit()
    return _load_movement(movement.id, db)


@router_movements.get("/export/pdf")
def export_movements_pdf(
    from_date:      Optional[date] = Query(None),
    to_date:        Optional[date] = Query(None),
    product_id:     Optional[str]  = Query(None),
    warehouse_id:   Optional[str]  = Query(None),
    movement_type:  Optional[MovementTypeEnum] = Query(None),
    db:             Session = Depends(get_db),
    current_user:   User    = Depends(get_current_user),
):
    q = db.query(StockMovement).options(
        joinedload(StockMovement.product).joinedload(Product.unit),
        joinedload(StockMovement.performed_by_user),
        joinedload(StockMovement.from_location).joinedload(WarehouseLocation.warehouse),
        joinedload(StockMovement.to_location).joinedload(WarehouseLocation.warehouse),
    )

    if product_id:
        q = q.filter(StockMovement.product_id == product_id)
    if warehouse_id:
        loc_ids = db.query(WarehouseLocation.id).filter(
            WarehouseLocation.warehouse_id == warehouse_id
        ).subquery()
        q = q.filter(
            (StockMovement.from_location_id.in_(loc_ids)) |
            (StockMovement.to_location_id.in_(loc_ids))
        )
    if movement_type:
        q = q.filter(StockMovement.movement_type == movement_type)
    if from_date:
        q = q.filter(StockMovement.performed_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        q = q.filter(StockMovement.performed_at <= datetime.combine(to_date, datetime.max.time()))

    movements = q.order_by(StockMovement.performed_at.desc()).all()

    # Resolver nombres para filtros en encabezado
    warehouse_name = None
    if warehouse_id:
        wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        warehouse_name = wh.name if wh else None

    product_name = None
    if product_id:
        p = db.query(Product).filter(Product.id == product_id).first()
        product_name = p.name if p else None

    # Construir filas para la plantilla
    rows = []
    for m in movements:
        rows.append({
            "performed_at":     m.performed_at.strftime("%d/%m/%Y %H:%M"),
            "movement_type":    m.movement_type.value,
            "movement_type_label": _MOVEMENT_LABELS.get(m.movement_type.value, m.movement_type.value),
            "is_reversal":      m.is_reversal,
            "product_name":     m.product.name,
            "product_sku":      m.product.sku,
            "from_location":    m.from_location.code if m.from_location else None,
            "to_location":      m.to_location.code   if m.to_location   else None,
            "quantity":         f"{m.quantity:g}",
            "unit":             m.product.unit.symbol if m.product.unit else "",
            "reference_doc":    m.reference_doc,
            "user":             m.performed_by_user.full_name or m.performed_by_user.username,
        })

    # Resumen por tipo
    summary: dict = {}
    for r in rows:
        t = r["movement_type"]
        if t not in summary:
            summary[t] = {"count": 0, "label": _MOVEMENT_LABELS.get(t, t), "color": _MOVEMENT_COLORS.get(t, "#1e293b")}
        summary[t]["count"] += 1

    filters = {
        "from_date":     from_date.strftime("%d/%m/%Y") if from_date else None,
        "to_date":       to_date.strftime("%d/%m/%Y")   if to_date   else None,
        "movement_type": _MOVEMENT_LABELS.get(movement_type.value, movement_type.value) if movement_type else None,
        "warehouse_name": warehouse_name,
        "product_name":   product_name,
    }

    # Auditoría
    db.add(AuditLog(
        user_id=current_user.id, action="EXPORT",
        table_name="stock_movements",
        description=f"PDF exportado: {len(rows)} movimientos",
    ))
    db.commit()

    # Renderizar HTML y convertir a PDF
    template = _jinja_env.get_template("movements_report.html")
    html = template.render(
        movements=rows,
        summary=summary,
        filters=filters,
        generated_at=datetime.now().strftime("%d/%m/%Y %H:%M"),
    )

    pdf_bytes = weasyprint.HTML(string=html).write_pdf()

    filename = f"movimientos_{datetime.now().strftime('%Y-%m-%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


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
        joinedload(StockMovement.from_location).joinedload(WarehouseLocation.warehouse),
        joinedload(StockMovement.to_location).joinedload(WarehouseLocation.warehouse),
    )

    if product_id:
        q = q.filter(StockMovement.product_id == product_id)
    if warehouse_id:
        # Filtra movimientos donde alguna de las ubicaciones pertenece al depósito
        from_locs = db.query(WarehouseLocation.id).filter(
            WarehouseLocation.warehouse_id == warehouse_id
        ).subquery()
        q = q.filter(
            (StockMovement.from_location_id.in_(from_locs)) |
            (StockMovement.to_location_id.in_(from_locs))
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

    reversal_type = {
        MovementTypeEnum.entrada:       MovementTypeEnum.salida,
        MovementTypeEnum.salida:        MovementTypeEnum.entrada,
        MovementTypeEnum.transferencia: MovementTypeEnum.transferencia,
        MovementTypeEnum.ajuste:        MovementTypeEnum.ajuste,
    }.get(original.movement_type, original.movement_type)

    reversal = StockMovement(
        movement_type        = reversal_type,
        product_id           = original.product_id,
        from_location_id     = original.to_location_id,
        to_location_id       = original.from_location_id,
        quantity             = original.quantity,
        notes                = f"REVERSIÓN de movimiento {movement_id}. Motivo: {notes}",
        performed_by         = current_user.id,
        is_reversal          = True,
        reversed_movement_id = movement_id,
    )

    if reversal_type == MovementTypeEnum.salida and original.to_location_id:
        _update_stock(db, original.product_id, original.to_location_id, -original.quantity)
    elif reversal_type == MovementTypeEnum.entrada and original.from_location_id:
        _update_stock(db, original.product_id, original.from_location_id, original.quantity)
    elif reversal_type == MovementTypeEnum.transferencia:
        _update_stock(db, original.product_id, original.to_location_id, -original.quantity)
        _update_stock(db, original.product_id, original.from_location_id, original.quantity)

    db.add(reversal)
    log = AuditLog(user_id=current_user.id, action="REVERSE", table_name="stock_movements",
                   record_id=movement_id, description=f"Reversión aplicada. Motivo: {notes}")
    db.add(log)
    db.commit()
    return _load_movement(reversal.id, db)