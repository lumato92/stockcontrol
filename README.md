# StockControl — MVP v1.0

Sistema de control de stock con trazabilidad completa. Backend en FastAPI + PostgreSQL, frontend en React + Vite.

---

## Requisitos locales

- Docker Desktop (Windows/Mac) o Docker + Docker Compose (Linux)
- Git

---

## Levantar en local (5 minutos)

```bash
# 1. Clonar el repo
git clone <tu-repo-url>
cd stockcontrol

# 2. Crear el archivo de variables de entorno
cp .env.example .env

# 3. Editar .env con tus valores (mínimo cambiar las contraseñas)
nano .env   # o cualquier editor

# 4. Levantar todo
docker compose up --build

# La primera vez tarda ~3 minutos (descarga imágenes y compila el frontend)
```

Accesos una vez levantado:
- **App:** http://localhost:80
- **API docs (Swagger):** http://localhost:8000/docs
- **Usuario inicial:** el email y contraseña que pusiste en `.env`

---

## Variables de entorno requeridas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `POSTGRES_PASSWORD` | Contraseña de la base de datos | `MiPassword123!` |
| `SECRET_KEY` | Clave JWT (32+ caracteres aleatorios) | ver abajo |
| `FIRST_ADMIN_EMAIL` | Email del primer admin | `admin@empresa.com` |
| `FIRST_ADMIN_PASSWORD` | Contraseña inicial del admin | `Admin123!` |
| `FIRST_ADMIN_NAME` | Nombre del admin | `Administrador` |
| `VITE_API_URL` | URL pública de la API | `https://api.tuapp.railway.app` |

**Generar SECRET_KEY:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
# o en cualquier generador online de strings aleatorios
```

---

## Despliegue en Railway (free tier)

Railway permite correr Docker Compose directamente. Seguí estos pasos:

### 1. Crear cuenta y proyecto

1. Ir a [railway.app](https://railway.app) y crear cuenta con GitHub
2. Crear un nuevo proyecto → **Deploy from GitHub repo**
3. Conectar el repositorio de StockControl

### 2. Agregar PostgreSQL

1. En el proyecto, click en **+ New** → **Database** → **PostgreSQL**
2. Railway crea la base de datos automáticamente
3. En la pestaña **Variables** de la DB copiá el valor de `DATABASE_URL`

### 3. Configurar variables de entorno del servicio backend

En el servicio de la app, ir a **Variables** y agregar:

```
POSTGRES_PASSWORD=    (la contraseña de la DB de Railway)
DATABASE_URL=         (el DATABASE_URL completo que copiaste)
SECRET_KEY=           (tu clave aleatoria)
FIRST_ADMIN_EMAIL=    admin@tuempresa.com
FIRST_ADMIN_PASSWORD= TuPasswordSegura123!
FIRST_ADMIN_NAME=     Administrador
ENVIRONMENT=          production
```

### 4. Configurar el servicio frontend

Railway puede servir el frontend como servicio separado:

1. **+ New** → **GitHub Repo** (el mismo repo, carpeta `frontend/`)
2. En Build Command: `npm run build`
3. En Start Command: `npx serve dist`
4. Agregar variable: `VITE_API_URL=https://<url-de-tu-backend>.railway.app`

### 5. Limitaciones del free tier a tener en cuenta

- Los servicios **se duermen** después de 15 minutos sin requests
- El primer request después del sleep tarda ~10-30 segundos
- Límite de 500 horas de ejecución por mes (suficiente para uso liviano)
- **Para uso en producción real**: upgrade a $5/mes en Railway o migrar a Hetzner VPS

### Alternativa recomendada: Hetzner VPS (€4/mes, sin sleep)

```bash
# En el VPS (Ubuntu 22.04)
curl -fsSL https://get.docker.com | sh
git clone <tu-repo>
cd stockcontrol
cp .env.example .env
# editar .env
docker compose up -d
```

---

## Estructura del proyecto

```
stockcontrol/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # auth, products, stock, users
│   │   ├── core/               # config, security (JWT, bcrypt)
│   │   ├── db/                 # sesión SQLAlchemy
│   │   ├── models/             # modelos ORM
│   │   └── schemas/            # validación Pydantic
│   ├── main.py                 # FastAPI app + seed inicial
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/         # UI, layout
│   │   ├── lib/                # api client, auth context, utils
│   │   ├── pages/              # Dashboard, Productos, Stock, Movimientos, etc.
│   │   └── types/              # TypeScript interfaces
│   ├── Dockerfile
│   └── package.json
├── nginx/
│   └── nginx.conf              # proxy reverso con rate limiting
├── docker-compose.yml
└── .env.example
```

---

## Endpoints principales de la API

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/v1/auth/login` | Login → tokens JWT |
| GET | `/api/v1/auth/me` | Usuario actual |
| GET | `/api/v1/products/` | Lista de productos (con filtros) |
| GET | `/api/v1/products/search?barcode=X` | Búsqueda por código de barras |
| POST | `/api/v1/products/` | Crear producto |
| GET | `/api/v1/stock/` | Stock actual |
| GET | `/api/v1/stock/summary` | KPIs del dashboard |
| POST | `/api/v1/movements/` | Registrar movimiento |
| GET | `/api/v1/movements/` | Historial de movimientos |
| POST | `/api/v1/movements/{id}/reverse` | Revertir movimiento |
| GET | `/api/v1/warehouses/` | Lista de depósitos |
| GET | `/api/v1/users/` | Lista de usuarios (solo admin) |

Documentación interactiva completa en `/docs` (Swagger UI).

---

## Roles y permisos

| Rol | Puede hacer |
|---|---|
| **Admin** | Todo: usuarios, depósitos, configuración |
| **Supervisor** | Ver reportes, revertir movimientos, gestionar depósitos |
| **Operator** | Cargar entradas/salidas/transferencias |
| **Auditor** | Solo lectura de todo |
| **Viewer** | Solo stock actual |

---

## Roadmap post-MVP

- [ ] Scanner de código de barras (PWA mobile, ZXing)
- [ ] Reportes en PDF con Celery + WeasyPrint
- [ ] Alertas por mail de stock mínimo
- [ ] Backups automáticos con pg_dump
- [ ] Importación masiva CSV/Excel
- [ ] 2FA para cuentas admin

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker compose logs -f backend

# Acceder a la base de datos
docker exec -it stockcontrol_db psql -U stockuser -d stockcontrol

# Backup manual de la base de datos
docker exec stockcontrol_db pg_dump -U stockuser stockcontrol > backup_$(date +%Y%m%d).sql

# Reiniciar solo el backend (sin perder datos)
docker compose restart backend

# Actualizar después de cambios en el código
docker compose up --build -d
```
