from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.api.v1.endpoints.deps import (
    get_current_user, require_admin_supervisor, require_operator_or_above
)
from app.models.models import (
    Warehouse, WarehouseLocation, Product, ProductUnitConversion, UnitOfMeasure
)
from app.schemas.schemas import (
    LocationCreate, LocationPatch, LocationOut,
    ConversionCreate, ConversionOut
)

router = APIRouter()


# ── Warehouse Locations ───────────────────────────────────────────────────────

def _get_warehouse_or_404(warehouse_id: str, db: Session) -> Warehouse:
    wh = db.query(Warehouse).filter(
        Warehouse.id == warehouse_id,
        Warehouse.is_active == True
    ).first()
    if not wh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Depósito no encontrado")
    return wh


def _get_location_or_404(warehouse_id: str, location_id: str, db: Session) -> WarehouseLocation:
    loc = db.query(WarehouseLocation).filter(
        WarehouseLocation.id == location_id,
        WarehouseLocation.warehouse_id == warehouse_id,
    ).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ubicación no encontrada")
    return loc


@router.get("/warehouses/{warehouse_id}/locations", response_model=List[LocationOut])
def list_locations(
    warehouse_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_warehouse_or_404(warehouse_id, db)
    return db.query(WarehouseLocation).filter(
        WarehouseLocation.warehouse_id == warehouse_id
    ).order_by(WarehouseLocation.code).all()


@router.post("/warehouses/{warehouse_id}/locations", response_model=LocationOut, status_code=201)
def create_location(
    warehouse_id: str,
    body: LocationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_supervisor),
):
    _get_warehouse_or_404(warehouse_id, db)

    # Validar parent pertenece al mismo depósito
    if body.parent_id:
        _get_location_or_404(warehouse_id, body.parent_id, db)

    # Código único por depósito (el modelo tiene UniqueConstraint pero damos mensaje claro)
    exists = db.query(WarehouseLocation).filter(
        WarehouseLocation.warehouse_id == warehouse_id,
        WarehouseLocation.code == body.code,
    ).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una ubicación con código '{body.code}' en este depósito"
        )

    loc = WarehouseLocation(
        warehouse_id=warehouse_id,
        **body.model_dump()
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.patch("/warehouses/{warehouse_id}/locations/{location_id}", response_model=LocationOut)
def patch_location(
    warehouse_id: str,
    location_id: str,
    body: LocationPatch,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_supervisor),
):
    loc = _get_location_or_404(warehouse_id, location_id, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(loc, field, value)

    db.commit()
    db.refresh(loc)
    return loc


# ── Product Unit Conversions ──────────────────────────────────────────────────

def _get_product_or_404(product_id: str, db: Session) -> Product:
    p = db.query(Product).filter(
        Product.id == product_id,
        Product.is_active == True
    ).first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return p


@router.get("/products/{product_id}/conversions", response_model=List[ConversionOut])
def list_conversions(
    product_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _get_product_or_404(product_id, db)
    return db.query(ProductUnitConversion).filter(
        ProductUnitConversion.product_id == product_id,
        ProductUnitConversion.is_active == True,
    ).all()


@router.post("/products/{product_id}/conversions", response_model=ConversionOut, status_code=201)
def create_conversion(
    product_id: str,
    body: ConversionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_supervisor),
):
    _get_product_or_404(product_id, db)

    # Validar que ambas unidades existen
    for unit_id in (body.from_unit_id, body.to_unit_id):
        if not db.query(UnitOfMeasure).filter(UnitOfMeasure.id == unit_id).first():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unidad de medida {unit_id} no encontrada"
            )

    if body.from_unit_id == body.to_unit_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Las unidades de origen y destino no pueden ser la misma"
        )

    # Duplicado
    exists = db.query(ProductUnitConversion).filter(
        ProductUnitConversion.product_id == product_id,
        ProductUnitConversion.from_unit_id == body.from_unit_id,
        ProductUnitConversion.to_unit_id == body.to_unit_id,
    ).first()
    if exists:
        if not exists.is_active:
            # Reactivar en lugar de duplicar
            exists.is_active = True
            exists.factor = body.factor
            db.commit()
            db.refresh(exists)
            return exists
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una conversión para ese par de unidades"
        )

    conv = ProductUnitConversion(product_id=product_id, **body.model_dump())
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.delete("/products/{product_id}/conversions/{conversion_id}", status_code=204)
def delete_conversion(
    product_id: str,
    conversion_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin_supervisor),
):
    conv = db.query(ProductUnitConversion).filter(
        ProductUnitConversion.id == conversion_id,
        ProductUnitConversion.product_id == product_id,
    ).first()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversión no encontrada")

    # Soft delete — consistente con el resto del sistema
    conv.is_active = False
    db.commit()