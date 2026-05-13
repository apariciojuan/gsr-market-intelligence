# GSR Market Intelligence

> Plataforma de análisis y vigilancia para prediction markets de Polymarket. Indexa datos on-chain de Polygon, los cruza con señales externas verificables (Chainlink) y noticias, y los visualiza en una web app profesional.

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-async-009688.svg)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-black.svg)](https://nextjs.org/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-336791.svg)](https://www.postgresql.org/)
[![UV](https://img.shields.io/badge/uv-0.svg)](https://docs.astral.sh/uv/)

---

## Qué es esto

Una herramienta web para analistas y traders cuantitativos que quieran entender en profundidad lo que está pasando en Polymarket, sin tener que escarbar manualmente en Polygonscan, la UI de Polymarket o el portal de UMA.

**Cuatro pilares funcionales:**

| Pilar | Descripción |
|---|---|
| **Market Explorer** | Búsqueda y exploración de mercados con datos on-chain y de las APIs de Polymarket. |
| **Resolution Watchdog** | Vigilancia del ciclo de resolución (UMA Oracle): propuestas, disputas, resoluciones. |
| **External Signals Cross-Check** | Cruce con Chainlink Data Feeds y noticias relevantes. Detección de divergencias. |
| **Ecosystem Dashboard** | Métricas agregadas: volumen, calibración histórica, top wallets, mapa de calor. |

**Qué NO es:** bot de trading, app consumer de apuestas, gestor de wallets.

---

## Documentación del proyecto (Esta es un research usando IA, se va a ir ajustando con el tiempo acorde a las desición tecnicas tomadas, el presente README ya muestra cambios comparados con los siguientes documentos)

Lee los documentos en este orden recomendado:

| # | Documento | Para qué | Léelo si... |
|---|---|---|---|
| 1 | [`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md) | Visión ejecutiva, pilares funcionales, fuentes de datos, arquitectura de workers, roadmap 8 semanas. | Es la primera vez que oyes hablar del proyecto. |
| 2 | [`docs/PROJECT_STRUCTURE.md`](./docs/PROJECT_STRUCTURE.md) | Estructura del monorepo, librerías Python y Node, reparto de roles, variables de entorno. | Vas a escribir código o configurar tu entorno. |
| 3 | [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Despliegue en AWS EC2 con Docker + Caddy, backups, monitoreo. | Vas a desplegar o mantener el sistema en producción. |

---

## Stack en una frase

Backend en **Python 3.12 + FastAPI** con workers `arq`, base de datos **PostgreSQL 17 + TimescaleDB + pgvector**, frontend en **Next.js + Tailwind + shadcn/ui** con gráficas **TradingView Lightweight Charts**, todo containerizado en **Docker** y desplegado en **AWS EC2** detrás de **Caddy** o **Nginx** como reverse proxy.

---

## Cómo arrancar en local (5 minutos)

**Requisitos previos:**
- Docker Desktop (Mac/Windows) o Docker + Compose (Linux).
- Una API key gratuita de [Alchemy](https://www.alchemy.com/polygon) para Polygon.

```bash
# 1. Clonar y configurar entorno
git clone https://github.com/apariciojuan/gsr-market-intelligence.git
cd gsr-market-intelligence
cp backend/env.example .env
# Editar .env: como mínimo, poner ALCHEMY_API_KEY
cp frontend/env.example .env

# 2. Levantar todo el stack
docker compose up -d --build

# 3. Abrir en el navegador
# - Frontend:        http://localhost:3000
# - Documentación API: http://localhost:8000/docs
```
---

## Estructura del repositorio

```
gsr-market-intelligence/
│
├── README.md                        ← estás aquí
├── docker-compose.yml               ← stack para desarrollo local
├── docker-compose.prod.yml          ← variante de producción
│
├── backend/                         ← FastAPI + workers + servicios
│   ├── app/
│   │   ├── api/                     ← endpoints REST
│   │   ├── models/                  ← modelos SQLAlchemy
│   │   ├── schemas/                 ← schemas Pydantic
│   │   ├── services/                ← lógica de negocio (blockchain, polymarket, news...)
│   │   └── workers/                 ← procesos arq en background
|   |── .env.example                 ← plantilla de variables de entorno
|   ├── notebooks/                   ← Jupyter para research interno (no producción)
│   ├── alembic/                     ← migraciones
│   ├── scripts/                     ← utilidades CLI
│   └── tests/
│
├── frontend/                        ← Next.js + Tailwind + shadcn/ui
|   |── .env.example                 ← plantilla de variables de entorno
│   ├── app/                         ← App Router (páginas)
│   ├── components/                  ← componentes React
│   ├── lib/                         ← cliente API, helpers
│   └── hooks/                       ← React hooks
|
├── postgresql/                      ← Dockerfile y init.sql
│
├── docs/                            ← toda la documentación
│
└── infra/                           ← Caddyfile, scripts AWS, GitHub Actions
```
---

## Cronograma 8 semanas

| Semana | Sprint | Entregable principal |
|---|---|---|
| 1 | Fundamentos | Conexiones a Polygon, Gamma y Chainlink en notebooks Jupyter. |
| 2 | chain-indexer | Indexador on-chain del CTF Exchange con checkpoint incremental. |
| 3 | DB + market-syncer | Schema completo + sincronización de Gamma/CLOB. |
| 4 | resolution-watcher | Indexación del UmaCtfAdapter + datos de resolución. |
| 5 | signals + divergence | Chainlink + RSS + cálculo de divergencias. |
| 6 | FastAPI + Auth | Backend completo con Api Token y todos los endpoints. |
| 7 | Frontend | Login + 5 pantallas core con gráficas. |
| 8 | AWS + presentación | Online en EC2 con HTTPS, demo lista para GSR. |

---

## Reparto del equipo

Tabla orientativa:

| Persona | Owner de | Aprende a fondo |
|---|---|---|
| 1 | Blockchain + indexación on-chain | web3.py, `eth_getLogs`, decodificación de ABIs |
| 2 | Polymarket APIs + UMA Oracle | Gamma/CLOB/Data APIs, ciclo de resolución |
| 3 | Backend FastAPI + autenticación | FastAPI async, SQLAlchemy, Api Token |
| 4 (Claude or Codex) | Frontend completo + diseño | Next.js, Tailwind, TradingView Charts |
| 5 (opcional) | DevOps + noticias + divergencias | Docker, Caddy, fastembed, scipy |

---

## Decisiones técnicas registradas

| Decisión | Justificación |
|---|---|
| **Sin LLMs** | Decisión consciente para acotar alcance. Las noticias se filtran por similitud de embeddings, no por sentiment analysis con LLM. |
| **Sin trading** | Solo lectura. Nunca firmamos transacciones. |
| **Solo Polygon (chain_id 137)** | El MVP asume Polymarket en Polygon. Multi-chain queda fuera. |
| **FastAPI sobre Django** | El sistema es naturalmente async (APIs externas, blockchain, workers). |
| **Monorepo** | Más simple que multi-repo para un equipo de 3. |
| **Jupyter como research, no entregable** | Lo que se valida en notebook se reescribe como código de producción. |

---

## Recursos externos clave

**Polymarket:**
- Docs principales: https://docs.polymarket.com/
- Polymarket 101: https://docs.polymarket.com/polymarket-101
- Contratos: https://docs.polymarket.com/resources/contracts
- Resolución: https://docs.polymarket.com/concepts/resolution

**Polygon:**
- Docs: https://docs.polygon.technology/pos
- Polygonscan (explorador): https://polygonscan.com
- Alchemy (provider): https://www.alchemy.com/polygon

**Oráculos:**
- Chainlink Data Feeds: https://docs.chain.link/data-feeds/price-feeds/addresses?network=polygon
- Chainlink Data Streams: https://docs.chain.link/data-streams
- UMA Oracle Portal: https://oracle.uma.xyz/
- UMA Docs: https://docs.uma.xyz/

---

## Para colaboradores nuevos

Si te acabas de incorporar al proyecto:

1. **Lee** `docs/PROJECT_OVERVIEW.md` (30 min).
2. **Lee** los enlaces de Polymarket 101 y Resolution (otros 30 min).
3. **Reproduce** el setup local de arriba.
4. **Abre** un notebook en `notebooks/` y juega un poco con la Gamma API.
---

## Soporte

- **Issues:** GitHub Issues de este repo

---

## Team

- **Juan Aparicio**
- **Pablo Gámez Guerrero**
- **Artur**

## Licencia

MVP académico/profesional desarrollado con supervisión de GSR. Uso interno y prototypado del equipo.
