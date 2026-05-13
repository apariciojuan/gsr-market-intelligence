# GSR Market Intelligence — Estructura del proyecto

Herramienta de análisis para prediction markets y señales de mercado en Polymarket. Indexa datos on-chain de Polygon, los cruza con señales externas verificables (Chainlink) y noticias, y los visualiza en una web app profesional.

**Funcionalidad principal para el usuario:** dashboard con cuatro pilares (Market Explorer, Resolution Watchdog, External Signals Cross-Check, Ecosystem Dashboard). Incluye **explorador de contratos**: el usuario pega una dirección de Polygon y el sistema grafica toda su actividad on-chain, decodificando eventos si es un contrato conocido de Polymarket.

---

## Caché incremental (patrón clave)

La primera vez que se consulta un contrato, se hace descarga histórica completa. Las siguientes consultas solo descargan los bloques nuevos desde la última sincronización (patrón checkpoint en tabla `sync_state`). Este patrón aplica a indexación on-chain, sincronización de Gamma API, y recolección de noticias.

---

## Stack tecnológico resumido

| Capa | Tecnología |
|---|---|
| Lenguaje backend | Python 3.12 |
| Framework web | FastAPI + Uvicorn (Gunicorn en producción) |
| Auth | fastapi-users (JWT) |
| ORM | SQLAlchemy 2.0 (async) |
| Migraciones | Alembic |
| Base de datos | PostgreSQL 16 + TimescaleDB + pgvector |
| Workers | arq (Redis-backed) |
| Cache | Redis 7 |
| Blockchain | web3.py + Alchemy/Infura |
| Embeddings (noticias) | fastembed (BGE-small) |
| Frontend | Next.js 15 + TypeScript + Tailwind + shadcn/ui |
| Gráficas | TradingView Lightweight Charts + Recharts |
| Containerización | Docker + Docker Compose |
| Despliegue | AWS EC2 + Caddy reverse proxy |
| Research interno | Jupyter Lab (notebooks separados del código de producción) |

> **Nota:** se descarta el uso de LLMs por decisión consciente de alcance. Las noticias se filtran solo por similitud semántica con embeddings, sin análisis de sentimiento.

---

## Estructura del monorepo

```
gsr-market-intelligence/
│
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml              # Stack completo para desarrollo local
├── docker-compose.prod.yml         # Variante para producción en EC2
│
├── backend/
│   ├── pyproject.toml              # Dependencias Python (uv o poetry)
│   ├── Dockerfile
│   ├── alembic.ini
│   │
│   ├── alembic/                    # Migraciones de base de datos
│   │   ├── env.py
│   │   └── versions/
│   │
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # Entrypoint FastAPI
│   │   ├── config.py               # Settings con pydantic-settings
│   │   │
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── deps.py             # Dependencias compartidas (auth, db session)
│   │   │   └── routes/
│   │   │       ├── auth.py         # Login, registro, JWT (fastapi-users)
│   │   │       ├── contracts.py    # ⭐ Explorador de contratos
│   │   │       ├── markets.py      # Mercados Polymarket
│   │   │       ├── resolutions.py  # Resolution Watchdog
│   │   │       ├── signals.py      # Divergencias y señales externas
│   │   │       ├── news.py         # Noticias asociadas a mercados
│   │   │       ├── ecosystem.py    # Métricas agregadas
│   │   │       └── health.py       # Healthcheck para EC2
│   │   │
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── security.py         # Hashes, JWT helpers
│   │   │   ├── database.py         # AsyncEngine y sesiones SQLAlchemy
│   │   │   └── redis.py            # Cliente Redis compartido
│   │   │
│   │   ├── models/                 # Modelos SQLAlchemy (ver DATABASE_SPEC.md)
│   │   │   ├── __init__.py
│   │   │   ├── base.py             # Base declarativa + mixins
│   │   │   ├── user.py
│   │   │   ├── contract.py
│   │   │   ├── transaction.py      # Hypertable
│   │   │   ├── market.py
│   │   │   ├── price_history.py    # Hypertable
│   │   │   ├── wallet_position.py
│   │   │   ├── oracle_proposal.py
│   │   │   ├── oracle_dispute.py
│   │   │   ├── chainlink_feed.py
│   │   │   ├── chainlink_price.py  # Hypertable
│   │   │   ├── news_item.py
│   │   │   ├── news_signal.py      # Solo similitud, sin LLM
│   │   │   ├── divergence.py
│   │   │   ├── sync_state.py
│   │   │   └── exploration_job.py
│   │   │
│   │   ├── schemas/                # Schemas Pydantic (request/response)
│   │   │   ├── __init__.py
│   │   │   ├── base.py             # APIModel base + validators custom
│   │   │   ├── validators.py       # EthAddress, TxHash custom types
│   │   │   ├── user.py
│   │   │   ├── contract.py
│   │   │   ├── transaction.py
│   │   │   ├── market.py
│   │   │   ├── resolution.py
│   │   │   ├── signal.py
│   │   │   ├── news.py
│   │   │   ├── ecosystem.py
│   │   │   └── pagination.py       # Paginated[T] genérico
│   │   │
│   │   ├── services/               # Lógica de negocio
│   │   │   ├── __init__.py
│   │   │   ├── blockchain/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── client.py       # Wrapper sobre web3.py
│   │   │   │   ├── decoder.py      # Decodificación de eventos con ABI
│   │   │   │   ├── indexer.py      # Lógica de indexación incremental con eth_getLogs
│   │   │   │   └── abis/           # ABIs JSON de contratos conocidos
│   │   │   │       ├── ctf_exchange.json
│   │   │   │       ├── neg_risk_ctf_exchange.json
│   │   │   │       ├── conditional_tokens.json
│   │   │   │       ├── uma_ctf_adapter_v2.json
│   │   │   │       ├── uma_ctf_adapter_v3.json
│   │   │   │       ├── uma_optimistic_oracle.json
│   │   │   │       ├── chainlink_aggregator_v3.json
│   │   │   │       └── erc20.json
│   │   │   ├── polymarket/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── gamma.py        # Cliente Gamma API
│   │   │   │   ├── clob.py         # Cliente CLOB API
│   │   │   │   ├── data_api.py     # Cliente Data API
│   │   │   │   └── identifier.py   # Detecta si una address es de Polymarket
│   │   │   ├── chainlink/
│   │   │   │   ├── __init__.py
│   │   │   │   └── price_feeds.py  # Lectura de feeds on-chain
│   │   │   ├── uma/
│   │   │   │   ├── __init__.py
│   │   │   │   └── oracle.py       # Lectura del UmaCtfAdapter y Optimistic Oracle
│   │   │   ├── news/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── rss_collector.py
│   │   │   │   ├── extractor.py    # Limpieza con trafilatura
│   │   │   │   └── embedder.py     # Embeddings con fastembed
│   │   │   └── divergences/
│   │   │       ├── __init__.py
│   │   │       ├── calculator.py   # Cálculo de divergencias mercado vs señal
│   │   │       └── types.py        # PriceGap, NewsNotReflected, SuddenMove
│   │   │
│   │   ├── workers/                # Procesos background con arq
│   │   │   ├── __init__.py
│   │   │   ├── settings.py         # Configuración arq (worker registry)
│   │   │   ├── chain_indexer.py    # CTF Exchange + Conditional Tokens
│   │   │   ├── market_syncer.py    # Gamma + CLOB API
│   │   │   ├── resolution_watcher.py  # UmaCtfAdapter + Optimistic Oracle
│   │   │   ├── signals_collector.py   # Chainlink feeds + RSS
│   │   │   ├── divergence_calculator.py
│   │   │   └── aggregator.py       # Métricas ecosistema
│   │   │
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── address.py          # Validación y normalización de addresses
│   │       ├── time.py             # Helpers de timestamps
│   │       └── retry.py            # Wrappers sobre tenacity
│   │
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py
│   │   ├── test_api/
│   │   ├── test_services/
│   │   ├── test_workers/
│   │   └── fixtures/
│   │
│   └── scripts/                    # Scripts auxiliares de mantenimiento
│       ├── seed_known_contracts.py # Carga ABIs + addresses de Polymarket
│       ├── seed_chainlink_feeds.py # Carga feeds Chainlink relevantes
│       ├── create_user.py          # CLI para crear usuarios del MVP
│       └── reset_db.py
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── components.json             # Config shadcn/ui
│   ├── Dockerfile
│   │
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Layout raíz con sidebar y topbar
│   │   ├── page.tsx                # Dashboard principal "/"
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── markets/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/
│   │   │       └── page.tsx        # ⭐ Market Detail
│   │   ├── contracts/
│   │   │   ├── page.tsx            # Buscador de address
│   │   │   └── [address]/
│   │   │       └── page.tsx        # Explorador on-chain
│   │   ├── resolutions/
│   │   │   ├── page.tsx
│   │   │   └── [questionId]/
│   │   │       └── page.tsx        # Timeline del ciclo de resolución
│   │   ├── signals/
│   │   │   └── page.tsx
│   │   ├── ecosystem/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn/ui (auto-generados)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   └── GlobalSearch.tsx    # ⌘K
│   │   ├── primitives/             # Componentes reutilizables del brief
│   │   │   ├── KpiCard.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── ChartContainer.tsx
│   │   │   ├── StatusPill.tsx
│   │   │   ├── AddressPill.tsx
│   │   │   ├── TabBar.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── Skeleton.tsx
│   │   ├── charts/
│   │   │   ├── PriceChart.tsx      # TradingView Lightweight Charts
│   │   │   ├── VolumeChart.tsx
│   │   │   ├── SparklineChart.tsx
│   │   │   ├── DivergenceChart.tsx
│   │   │   ├── CalibrationScatter.tsx
│   │   │   └── ResolutionTimeline.tsx  # D3 o custom SVG
│   │   ├── market/
│   │   │   ├── MarketHeader.tsx
│   │   │   ├── MarketStatsCard.tsx
│   │   │   ├── TradesTab.tsx
│   │   │   ├── OrderbookTab.tsx
│   │   │   ├── HoldersTab.tsx
│   │   │   ├── ResolutionTab.tsx
│   │   │   └── SignalsTab.tsx
│   │   ├── contract/
│   │   │   ├── AddressInput.tsx
│   │   │   ├── ContractHeader.tsx
│   │   │   ├── ActivitySummary.tsx
│   │   │   └── TransactionList.tsx
│   │   └── auth/
│   │       └── LoginForm.tsx
│   │
│   ├── lib/
│   │   ├── api.ts                  # Cliente HTTP hacia FastAPI
│   │   ├── auth.ts                 # Helpers JWT
│   │   ├── format.ts               # Formateo de números, fechas, addresses
│   │   └── utils.ts                # cn(), etc.
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useMarket.ts
│   │   ├── useContract.ts
│   │   ├── useResolutions.ts
│   │   └── useDivergences.ts
│   │
│   └── public/
│
├── notebooks/                      # Research y prototipado (Jupyter)
│   ├── README.md                   # Convenciones de uso
│   ├── 01_explore_gamma_api.ipynb
│   ├── 02_explore_polygon_rpc.ipynb
│   ├── 03_decode_ctf_exchange_events.ipynb
│   ├── 04_chainlink_feeds_reading.ipynb
│   ├── 05_news_embeddings_similarity.ipynb
│   └── 06_divergence_prototyping.ipynb
│
├── docs/
│   ├── PROJECT_OVERVIEW.md         # Resumen ejecutivo y fuentes de datos
│   ├── UI_DESIGN_BRIEF.md          # Brief para diseño/IA generadora
│   ├── DATABASE_SPEC.md            # Schema completo de la BD
│   ├── DEPLOYMENT.md               # Despliegue en AWS EC2
│   ├── api.md                      # Documentación de endpoints
│   └── data_sources.md             # Tabla compacta de endpoints externos
│
└── infra/
    ├── caddy/
    │   └── Caddyfile               # Reverse proxy + TLS automático
    ├── aws/
    │   ├── bootstrap.sh            # Script idempotente para preparar EC2
    │   ├── deploy.sh               # Despliegue (pull + restart containers)
    │   └── ec2-userdata.sh         # User data para creación inicial
    └── github-actions/
        └── deploy.yml              # CI/CD opcional
```

---

## Librerías Python (backend)

### Núcleo web y servidor

| Librería | Uso |
|---|---|
| `fastapi` ^0.115 | Framework web async |
| `uvicorn[standard]` ^0.32 | Servidor ASGI |
| `gunicorn` ^23 | Process manager en producción |
| `pydantic` ^2.9 | Validación |
| `pydantic-settings` ^2.6 | Settings por env vars |
| `python-multipart` ^0.0.20 | Multipart forms |

### Autenticación

| Librería | Uso |
|---|---|
| `fastapi-users[sqlalchemy]` ^14 | Registro, login, JWT, reset password |
| `passlib[bcrypt]` ^1.7 | Hashing de contraseñas |
| `python-jose[cryptography]` ^3.3 | Manejo JWT |

### Base de datos

| Librería | Uso |
|---|---|
| `sqlalchemy[asyncio]` ^2.0 | ORM async |
| `asyncpg` ^0.30 | Driver PostgreSQL async |
| `alembic` ^1.14 | Migraciones |
| `pgvector` ^0.3 | Cliente Python para extensión pgvector |

### Workers y cache

| Librería | Uso |
|---|---|
| `arq` ^0.26 | Workers async sobre Redis |
| `redis[hiredis]` ^5.2 | Cliente Redis |

### Blockchain

| Librería | Uso |
|---|---|
| `web3` ^7.6 | Cliente Polygon |
| `eth-account` ^0.13 | Manejo direcciones |
| `eth-abi` ^5.1 | Decodificación de eventos |
| `eth-utils` ^5.1 | Utilidades (checksum, etc.) |

### HTTP y conexiones externas

| Librería | Uso |
|---|---|
| `httpx` ^0.28 | Cliente HTTP async |
| `tenacity` ^9.0 | Reintentos con backoff (rate limits) |
| `websockets` ^14 | Cliente WS para CLOB Polymarket |

### Procesamiento de noticias

| Librería | Uso |
|---|---|
| `feedparser` ^6.0 | Parsing RSS |
| `trafilatura` ^2.0 | Extracción de texto limpio de HTML |
| `beautifulsoup4` ^4.12 | Parsing HTML auxiliar |
| `fastembed` ^0.5 | Embeddings BGE-small (sin GPU) |

### Análisis numérico

| Librería | Uso |
|---|---|
| `numpy` ^2.1 | Operaciones numéricas |
| `pandas` ^2.2 | Manipulación series temporales |
| `scipy` ^1.14 | Correlaciones, lag analysis, estadística |

### Testing y calidad

| Librería | Uso |
|---|---|
| `pytest` ^8.3 | Framework de tests |
| `pytest-asyncio` ^0.25 | Soporte async |
| `pytest-cov` ^6.0 | Cobertura |
| `ruff` ^0.8 | Linter + formatter |
| `mypy` ^1.13 | Type checking estático |

### Utilidades

| Librería | Uso |
|---|---|
| `python-dotenv` ^1.0 | Carga de `.env` |
| `loguru` ^0.7 | Logging estructurado |

### Research (solo notebooks, no producción)

| Librería | Uso |
|---|---|
| `jupyterlab` ^4 | Entorno de notebooks |
| `ipykernel` ^6 | Kernel Python para Jupyter |
| `matplotlib` ^3.9 | Gráficas en notebooks |
| `seaborn` ^0.13 | Gráficas estadísticas |
| `plotly` ^5 | Gráficas interactivas en notebooks |

---

## Librerías Node.js (frontend)

### Núcleo

| Librería | Uso |
|---|---|
| `next` ^15 | Framework React full-stack |
| `react` ^19 | UI |
| `react-dom` ^19 | Renderizado |
| `typescript` ^5.7 | Tipado |

### UI y estilos

| Librería | Uso |
|---|---|
| `tailwindcss` ^3.4 | CSS utility-first |
| `@tailwindcss/typography` | Texto largo |
| `tailwind-merge` | Merge de clases Tailwind |
| `class-variance-authority` | Variantes de componentes |
| `@radix-ui/*` | Primitivas accesibles base (vía shadcn/ui) |
| `lucide-react` | Iconos |

### Gráficas

| Librería | Uso |
|---|---|
| `lightweight-charts` ^4.2 | TradingView, gráficas principales de precio |
| `recharts` ^2.13 | Gráficas auxiliares (barras, scatter, pie) |
| `d3` ^7 | Solo para timeline custom del oracle |

### Estado y datos

| Librería | Uso |
|---|---|
| `@tanstack/react-query` ^5 | Fetching, cache, sync con backend |
| `axios` ^1.7 | Cliente HTTP |
| `zustand` ^5 | Estado global ligero |
| `zod` ^3.23 | Validación en cliente |

### Formularios

| Librería | Uso |
|---|---|
| `react-hook-form` ^7.54 | Formularios |
| `@hookform/resolvers` | Integración con zod |

### Utilidades

| Librería | Uso |
|---|---|
| `date-fns` ^4 | Fechas |
| `viem` ^2.21 | Validación de addresses, formateo |

---

## Despliegue en AWS (resumen, detalle en `DEPLOYMENT.md`)

**Topología:**
- 1× EC2 t3.medium (2 vCPU, 4 GB RAM) en Ubuntu 22.04.
- Volumen EBS 30 GB gp3 para datos de Postgres.
- 1 Security Group permitiendo 22, 80, 443 entrantes.
- 1 Elastic IP asociada al EC2.
- (Opcional) Route 53 para dominio personalizado.

**Stack dentro del EC2:**
- Docker + Docker Compose.
- `docker-compose.prod.yml` levanta: postgres, redis, backend, workers, frontend, **Caddy** como reverse proxy con HTTPS automático.
- Backend y frontend NO exponen puertos al exterior, solo Caddy en 80/443.

**Flujo de despliegue:**
1. Build local de imágenes `backend` y `frontend`.
2. Push a Docker Hub o ECR.
3. SSH al EC2, `git pull`, `docker compose pull`, `docker compose up -d`.
4. Migraciones: `docker compose exec backend alembic upgrade head`.

**Coste estimado MVP/mes:** EC2 t3.medium (~30€) + EBS 30 GB (~3€) + Elastic IP (gratis si asociada) ≈ 35€/mes.

---

## Cronograma 8 semanas (revisado)

| Semana | Sprint | Entregable principal | Notas |
|---|---|---|---|
| 1 | Fundamentos | Conexiones Polygon + Gamma + Chainlink en notebooks Jupyter | Cada miembro reproduce los notebooks 01-04 |
| 2 | chain-indexer | Indexador on-chain CTF Exchange con checkpoint | Sprint clave: aquí se valida la arquitectura |
| 3 | DB + market-syncer | Schema completo, migraciones Alembic, sync de Gamma/CLOB | Define el contrato de datos para todos |
| 4 | resolution-watcher | UmaCtfAdapter + Optimistic Oracle indexados | Pilar B funcional en DB |
| 5 | signals-collector + divergence | Chainlink feeds + RSS + cálculo de divergencias | Pilar C funcional |
| 6 | FastAPI + Auth + endpoints | Todos los endpoints documentados en `/docs` | Backend completo |
| 7 | Frontend | Login + 5 pantallas core con gráficas | Dashboard, Market Detail, Resolutions, Signals, Contracts |
| 8 | AWS + presentación | Online en EC2 con HTTPS, demo lista | Caddy + dominio + slides |

---

## Reparto entre 4-5 personas

| Persona | Owner de | Aprende a fondo |
|---|---|---|
| 1 | Blockchain + indexación | web3.py, eth_getLogs, decodificación ABI |
| 2 | Polymarket APIs + market-syncer + resolution-watcher | Gamma/CLOB/Data APIs + UMA Oracle |
| 3 | Backend FastAPI + auth + endpoints | FastAPI, SQLAlchemy async, JWT |
| 4 | Frontend completo + diseño | Next.js, Tailwind, TradingView Charts |
| 5 (opcional) | DevOps + AWS + noticias + divergencias | Docker, Caddy, fastembed, scipy |

Si sois 4, la persona 5 se reparte entre 1 (DevOps) y 2 (noticias).

---

## Decisiones técnicas registradas

1. **Sin LLMs.** Decisión consciente para acotar alcance. Si en el futuro se quiere añadir análisis de sentimiento, está previsto en la arquitectura (worker `news-analyzer` puede añadirse sin tocar el resto).
2. **Sin trading.** Solo lectura on-chain y desde APIs públicas. No firmamos transacciones nunca.
3. **Solo Polygon.** No multi-chain en MVP. Toda la arquitectura asume `chain_id=137`.
4. **Jupyter como herramienta interna de research, no como entregable.** Lo que se valida en notebook se reescribe como código de producción.
5. **Monorepo.** Frontend y backend en el mismo repo. Más simple para un equipo de 4-5 personas que multi-repo.
6. **FastAPI sobre Django.** Decidido porque el sistema es naturalmente async (LLMs descartados, pero quedan APIs externas, blockchain y workers async). Auth resuelta con `fastapi-users` para los 4-5 usuarios.
