from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.session import engine, SessionLocal
from app.models.models import Base
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.products import router as products_router
from app.api.v1.endpoints.stock import router_movements, router_stock, router_warehouses
from app.api.v1.endpoints.users import router_users, router_categories, router_units
from app.api.v1.endpoints.locations import router as locations_router

app = FastAPI(
    title="StockControl API",
    description="Sistema de gestión de stock con trazabilidad completa",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restringir en producción
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


PREFIX = settings.API_V1_STR

app.include_router(auth_router, prefix=f"{PREFIX}/auth", tags=["Autenticación"])
app.include_router(products_router, prefix=f"{PREFIX}/products", tags=["Productos"])
app.include_router(router_warehouses, prefix=f"{PREFIX}/warehouses", tags=["Depósitos"])
app.include_router(locations_router, prefix=PREFIX, tags=["Ubicaciones"])
app.include_router(router_stock, prefix=f"{PREFIX}/stock", tags=["Stock"])
app.include_router(router_movements, prefix=f"{PREFIX}/movements", tags=["Movimientos"])
app.include_router(router_users, prefix=f"{PREFIX}/users", tags=["Usuarios"])
app.include_router(router_categories, prefix=f"{PREFIX}/categories", tags=["Categorías"])
app.include_router(router_units, prefix=f"{PREFIX}/units", tags=["Unidades"])


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}


@app.on_event("startup")
def startup():
    # Crear tablas si no existen
    Base.metadata.create_all(bind=engine)
    _seed_initial_data()


def _seed_initial_data():
    db = SessionLocal()
    try:
        from app.models.models import User, RoleEnum, UnitOfMeasure, Warehouse, Category
        from app.core.security import hash_password

        # Admin inicial
        if not db.query(User).first():
            admin = User(
                email=settings.FIRST_ADMIN_EMAIL,
                username="admin",
                hashed_password=hash_password(settings.FIRST_ADMIN_PASSWORD),
                full_name=settings.FIRST_ADMIN_NAME,
                role=RoleEnum.admin,
                is_active=True,
            )
            db.add(admin)

        # Unidades de medida base
        units = [
            ("Unidad", "u"), ("Kilogramo", "kg"), ("Gramo", "g"),
            ("Litro", "L"), ("Metro", "m"), ("Caja", "caja"),
            ("Par", "par"), ("Rollo", "rollo"),
        ]
        for name, symbol in units:
            if not db.query(UnitOfMeasure).filter(UnitOfMeasure.name == name).first():
                db.add(UnitOfMeasure(name=name, symbol=symbol))

        # Depósito inicial
        if not db.query(Warehouse).first():
            db.add(Warehouse(name="Depósito Principal", address=""))

        # Categoría inicial
        if not db.query(Category).first():
            db.add(Category(name="General", description="Categoría general"))

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error en seed: {e}")
    finally:
        db.close()
