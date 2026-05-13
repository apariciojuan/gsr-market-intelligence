# GSR Market Intelligence — Despliegue en AWS

Guía operativa para levantar el sistema en local con Docker Compose y desplegarlo en una instancia EC2 de AWS para acceso externo (HTTPS, dominio o IP pública).

---

## 1. Resumen de la topología

```
Internet ──→ [ Elastic IP / DNS ]
                    │
                    ▼
            ┌───────────────────┐
            │   AWS EC2         │
            │   t3.medium       │
            │   Ubuntu 22.04    │
            ├───────────────────┤
            │  Docker Compose:  │
            │                   │
            │  ┌─ caddy ───┐    │ ← único contenedor expuesto (80, 443)
            │  │  HTTPS    │    │   gestiona TLS automático con Let's Encrypt
            │  └─────┬─────┘    │
            │        │ (red interna Docker)
            │  ┌─────┴─────┐    │
            │  │ frontend  │    │ ← Next.js, :3000 interno
            │  └───────────┘    │
            │  ┌───────────┐    │
            │  │ backend   │    │ ← FastAPI, :8000 interno
            │  └─────┬─────┘    │
            │  ┌─────┴─────┐    │
            │  │ workers   │    │ ← arq workers, mismo container o aparte
            │  └─────┬─────┘    │
            │  ┌─────┴─────┐    │
            │  │ postgres  │    │ ← TimescaleDB + pgvector, :5432 interno
            │  │ redis     │    │ ← :6379 interno
            │  └───────────┘    │
            └───────────────────┘
                    │
                    ▼
            EBS volume 30 GB
            (datos Postgres persistentes)
```

**Solo Caddy expone puertos al exterior.** Backend, frontend, postgres y redis se comunican entre sí por la red interna de Docker.

---

## 2. Desarrollo local con Docker Compose

### 2.1 `docker-compose.yml` (local)

Servicios que se levantan:

| Servicio | Imagen base | Puerto externo | Notas |
|---|---|---|---|
| `postgres` | `timescale/timescaledb-ha:pg16` | 5432 | Ya incluye TimescaleDB y pgvector |
| `redis` | `redis:7-alpine` | 6379 | Para arq + cache |
| `backend` | build de `backend/Dockerfile` | 8000 | FastAPI con hot-reload (`uvicorn --reload`) |
| `workers` | misma imagen que backend, comando distinto | — | Ejecuta `arq app.workers.settings.WorkerSettings` |
| `frontend` | build de `frontend/Dockerfile` | 3000 | Next.js dev mode (`pnpm dev`) |

**Variables de entorno** se leen del `.env` en la raíz del repo (no commitear, hay `.env.example`).

**Volúmenes:**
- `postgres_data` → datos persistentes de Postgres.
- `redis_data` → snapshots de Redis (opcional).
- Bind mounts de `./backend` y `./frontend` para hot-reload en desarrollo.

**Comandos típicos:**

```bash
# Primera vez
cp .env.example .env
# Editar .env con la API key de Alchemy

# Levantar todo en background
docker compose up -d

# Ver logs en vivo
docker compose logs -f backend
docker compose logs -f workers

# Aplicar migraciones (primera vez y cuando haya cambios)
docker compose exec backend alembic upgrade head

# Reiniciar un servicio
docker compose restart backend

# Apagar todo
docker compose down

# Apagar y borrar volúmenes (reset completo, ojo)
docker compose down -v
```

### 2.2 Workers en local

En desarrollo, los workers viven en el mismo `docker-compose.yml` como servicio separado, usando la misma imagen que el backend pero con `command: arq app.workers.settings.WorkerSettings`. Esto permite reiniciarlos sin tocar el backend de la API.

Si en algún momento un worker concreto consume mucho, se puede separar en su propio servicio con su propio `command` (ej: solo el `chain-indexer`).

---

## 3. Preparación de la instancia EC2

### 3.1 Especificaciones recomendadas

| Recurso | Valor |
|---|---|
| Tipo de instancia | `t3.medium` (2 vCPU, 4 GB RAM) |
| Sistema operativo | Ubuntu 22.04 LTS |
| Almacenamiento root | 20 GB gp3 |
| Almacenamiento adicional | 30 GB gp3 montado en `/var/lib/docker` o dedicado a datos |
| Región | `eu-west-1` (Irlanda) o `eu-south-2` (España) según latencia |

**Coste estimado:** ~30€/mes (instancia) + ~3€/mes (EBS) ≈ 35€/mes.

Si el MVP demuestra que da igual la latencia, `t3.small` (2 vCPU, 2 GB) costaría ~15€/mes pero podría quedar justo con todos los workers corriendo.

### 3.2 Security Group

Reglas de entrada:

| Protocolo | Puerto | Origen | Para qué |
|---|---|---|---|
| TCP | 22 | Tu IP / VPN | SSH (no abrir al mundo) |
| TCP | 80 | 0.0.0.0/0 | HTTP (Caddy redirige a 443) |
| TCP | 443 | 0.0.0.0/0 | HTTPS |

Reglas de salida: permitir todo (default).

### 3.3 Elastic IP

Asociar una Elastic IP a la instancia para que la IP pública no cambie al reiniciar. Es gratis si está asociada a una instancia en ejecución.

### 3.4 (Opcional) Dominio personalizado

Si no tenéis dominio propio, alternativas:
- **`nip.io`**: pone la IP en el dominio (ej: `52.213.45.67.nip.io`). Gratis, sin registro.
- **Subdominio en un dominio que tengáis**: configurar un registro A apuntando a la Elastic IP.

Si lleváis dominio propio, Caddy obtendrá automáticamente el certificado HTTPS de Let's Encrypt.

---

## 4. Bootstrap del EC2 (primera vez)

### 4.1 Conexión inicial

```bash
ssh -i tu-clave.pem ubuntu@<ELASTIC_IP>
```

---

## 5. Caddy como reverse proxy con HTTPS

### 5.1 `Caddyfile`

Va en `infra/caddy/Caddyfile`. Sustituir `gsr-mi.example.com` por el dominio real (o IP pública con `:80` para sin TLS).

```
gsr-mi.example.com {
    # API del backend en /api/*
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy backend:8000
    }

    # Documentación auto de FastAPI
    handle /docs* {
        reverse_proxy backend:8000
    }
    handle /openapi.json {
        reverse_proxy backend:8000
    }

    # WebSocket si se usa para live updates
    handle /ws/* {
        reverse_proxy backend:8000
    }

    # Todo lo demás al frontend Next.js
    handle {
        reverse_proxy frontend:3000
    }

    # Logging
    log {
        output file /var/log/caddy/access.log
    }

    # Compresión
    encode gzip zstd
}
```

Caddy gestiona automáticamente el certificado HTTPS de Let's Encrypt si apunta un dominio real. Si solo tenéis IP, usar:

```
:80 {
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy backend:8000
    }
    handle {
        reverse_proxy frontend:3000
    }
}
```

(Sin TLS, accesible vía `http://<IP>`.)

### 5.2 Integración en `docker-compose.prod.yml`

Añadir servicio Caddy:

```yaml
caddy:
  image: caddy:2-alpine
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
    - caddy_config:/config
  networks:
    - internal
  depends_on:
    - backend
    - frontend
```

**Y crucialmente:** `backend` y `frontend` ya NO exponen puertos al host en producción, solo se comunican por la red interna `internal`.

---

## 6. Diferencias clave entre `docker-compose.yml` y `docker-compose.prod.yml`

| Aspecto | Desarrollo local | Producción AWS |
|---|---|---|
| Caddy | No incluido | Sí, expone 80/443 |
| Puertos backend | `8000:8000` expuesto | Solo red interna |
| Puertos frontend | `3000:3000` expuesto | Solo red interna |
| Volumen código | Bind mounts (`./backend`) | Imagen built, sin bind |
| Comando backend | `uvicorn --reload` | `gunicorn -k uvicorn.workers.UvicornWorker -w 4` |
| Comando frontend | `pnpm dev` | `pnpm start` (build previo) |
| `restart` policy | No | `unless-stopped` |
| Logs | stdout solamente | stdout + log driver |
| `.env` | `.env` local | `.env.production` en el EC2 |

---

