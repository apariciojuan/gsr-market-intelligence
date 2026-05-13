# GSR Market Intelligence — Información general del proyecto

> Herramienta de análisis y vigilancia para prediction markets de Polymarket. Cruza datos on-chain con fuentes externas (Chainlink, noticias) para entender cómo se forman los precios, cómo se resuelven los mercados y dónde hay discrepancias entre el mercado y la realidad.

---

## 1. Resumen ejecutivo

**Qué es:** una plataforma web profesional para analistas y traders cuantitativos que quieran entender en profundidad lo que está pasando en Polymarket, sin tener que escarbar manualmente en Polygonscan, la UI de Polymarket o el portal de UMA.

**Qué NO es:**
- No es un bot de trading (no ejecuta órdenes, no firma transacciones).
- No es una app de apuestas para consumidores casuales.
- No gestiona wallets de usuarios.
- No incluye plataformas distintas a Polymarket en el MVP.

**Propuesta de valor diferenciadora:** combina tres ángulos que hoy nadie ofrece junto en una sola herramienta:
1. Exploración avanzada de mercados y contratos on-chain.
2. Vigilancia activa del ciclo de resolución (UMA Oracle).
3. Cruce con señales externas verificables (Chainlink Data Streams + noticias).

---

## 2. Pilares funcionales del producto

| Pilar | Nombre | Qué hace | Diferenciación |
|---|---|---|---|
| A | Market Explorer | Permite buscar un mercado por slug, keyword o pegando una dirección de contrato. Muestra evolución de precio, volumen, liquidez, top wallets y trades. | Densidad de información mayor que Polymarket UI; soporta exploración por address. |
| B | Resolution Watchdog | Vista dedicada al ciclo de resolución: propuestas activas en UMA, disputas en curso, mercados próximos a expirar, histórico de resoluciones controvertidas. | No existe en ninguna herramienta actual. Ángulo único del proyecto. |
| C | External Signals Cross-Check | Para cada mercado intenta enlazar señales externas: si es de precio, comparar con Chainlink; si es de evento, enlazar noticias en línea de tiempo. Detecta divergencias. | Combina datos on-chain verificables (Chainlink) con datos off-chain (medios). |
| D | Ecosystem Dashboard | Métricas agregadas del ecosistema: volumen, mercados activos, calibración histórica, top wallets, mapa de calor. | Visión macro accesible sin scripts custom. |

---

## 3. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12 + FastAPI + Uvicorn |
| Autenticación | fastapi-users (JWT) — 4-5 usuarios autorizados en MVP |
| ORM y migraciones | SQLAlchemy 2.0 async + Alembic |
| Base de datos | PostgreSQL 16 + TimescaleDB + pgvector |
| Cache y colas | Redis 7 |
| Workers async | arq (Redis-backed) |
| Conexión blockchain | web3.py + Alchemy/Infura como provider |
| Procesamiento de noticias | feedparser + httpx + trafilatura + fastembed |
| Frontend | Next.js 15 + TypeScript + Tailwind + shadcn/ui |
| Gráficas | TradingView Lightweight Charts + Recharts |
| Despliegue | Railway o Fly.io |

---

## 4. Arquitectura general

El sistema se compone de **seis workers en background** independientes y una **API FastAPI** que sirve los datos al frontend. Todo escribe y lee de una base de datos PostgreSQL con extensiones.

### 4.1 Workers (procesos independientes)

| Worker | Frecuencia | Responsabilidad |
|---|---|---|
| `market-syncer` | cada 5 min | Sincroniza metadata de mercados desde Gamma API y orderbook snapshot desde CLOB API |
| `chain-indexer` | polling 30 s | Lee eventos del CTF Exchange y Conditional Tokens en Polygon (trades, posiciones) |
| `resolution-watcher` | cada 2 min | Vigila el UmaCtfAdapter en Polygon: propuestas, disputas, resoluciones |
| `signals-collector` | cada 1-5 min | Lee Chainlink Data Streams para precios financieros y descarga RSS de medios |
| `divergence-calculator` | cada 10 min | Para cada mercado activo, calcula divergencias entre precio del mercado y señales externas |
| `aggregator` | cada hora | Recalcula métricas agregadas del ecosistema |

### 4.2 Tipos de conexiones

El sistema usa **tres tipos de conexiones técnicas distintas**:

1. **HTTP REST** con `httpx` — para Gamma API, CLOB API, RSS, NewsAPI.
2. **WebSocket** con `websockets` — para CLOB WebSocket de Polymarket y para enviar updates en vivo al frontend.
3. **JSON-RPC blockchain** con `web3.py` — para leer Polygon, UMA Oracle, Chainlink Data Streams on-chain.

---

## 5. Fuentes de datos — referencia compacta

> Esta tabla es **el atajo** para revisar la documentación. Solo los endpoints listados son los que necesitamos para el MVP. La documentación oficial completa es enorme y la mayoría no aplica.

### 5.1 Polymarket Gamma API (metadata de mercados)

- **Base URL:** `https://gamma-api.polymarket.com`
- **Documentación oficial:** https://docs.polymarket.com/market-data/overview
- **Guía de uso:** https://docs.polymarket.com/market-data/fetching-markets
- **Auth:** ninguna, totalmente público.

Endpoints que vamos a usar:

| Endpoint | Para qué lo usamos |
|---|---|
| `GET /events` | Listar eventos (con paginación, filtros por tag/categoría/activo). Punto de entrada del market-syncer. |
| `GET /events/{id}` | Detalle completo de un evento. |
| `GET /markets` | Listar mercados individuales. Útil para mercados binarios sueltos. |
| `GET /markets/{id}` | Detalle de un mercado: outcomes, outcomePrices, condition_id, token IDs. |
| `GET /public-search` | Búsqueda por keyword. Necesario para el buscador del frontend. |
| `GET /tags` | Categorías ranked. Para los filtros del UI. |

### 5.2 Polymarket CLOB API (precios y orderbooks)

- **Base URL:** `https://clob.polymarket.com`
- **Documentación oficial:** https://docs.polymarket.com/market-data/overview
- **Concepto de precios y orderbook:** https://docs.polymarket.com/concepts/prices-orderbook
- **Auth:** ninguna para lectura. Solo necesaria para trading (que NO hacemos).

Endpoints que vamos a usar:

| Endpoint | Para qué lo usamos |
|---|---|
| `GET /price?token_id=X&side=buy` | Precio actual de un token (outcome). |
| `GET /prices` (POST con múltiples token IDs) | Precios en lote para varios tokens a la vez. |
| `GET /book?token_id=X` | Orderbook completo (bids/asks). Para la tab "Orderbook" del market detail. |
| `GET /prices-history?market=X&interval=1h` | **Crítico para gráficas.** Histórico de precios por token. Intervalos: `1m`, `1h`, `6h`, `1d`, `1w`, `max`. |
| `GET /midpoint?token_id=X` | Punto medio bid/ask. |
| `GET /spread?token_id=X` | Spread del orderbook. |

### 5.3 Polymarket Data API (posiciones y trades)

- **Base URL:** `https://data-api.polymarket.com`
- **Documentación oficial:** https://docs.polymarket.com/market-data/overview
- **Auth:** ninguna.

Endpoints que vamos a usar:

| Endpoint | Para qué lo usamos |
|---|---|
| `GET /trades?market=X` | Histórico de trades de un mercado. Alimenta la tab "Trades". |
| `GET /holders?market=X` | Top holders de un mercado. Alimenta la tab "Holders". |
| `GET /oi?market=X` | Open interest del mercado. KPI lateral. |
| `GET /positions?user={address}` | Posiciones actuales de una wallet. Para vista de wallet. |
| `GET /activity?user={address}` | Actividad on-chain de una wallet. |
| `GET /value?user={address}` | Valor total en USD de las posiciones de una wallet. |

### 5.4 Polygon (blockchain)

- **Documentación oficial:** https://docs.polygon.technology/pos
- **Polygonscan (explorador):** https://polygonscan.com
- **Provider recomendado:** Alchemy free tier (https://www.alchemy.com/polygon) o Infura.

Acceso técnico: vía endpoint JSON-RPC dado por Alchemy/Infura, usado con `web3.py`.

**Método más importante:** `eth_getLogs` con filtros por `address` y `topics` para leer eventos en lotes de bloques (~2000 bloques por petición). Mucho más eficiente que iterar bloque por bloque.

### 5.5 Smart contracts de Polymarket en Polygon

Todas las direcciones están en https://docs.polymarket.com/resources/contracts

**Contratos que vamos a indexar:**

| Contrato | Dirección | Worker que lo usa | Eventos clave |
|---|---|---|---|
| CTF Exchange | `0xE111180000d2663C0091e4f400237545B87B996B` | chain-indexer | `OrderFilled`, `OrdersMatched` |
| Neg Risk CTF Exchange | `0xe2222d279d744050d28e00520010520000310F59` | chain-indexer | `OrderFilled`, `OrdersMatched` |
| Conditional Tokens (CTF) | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | chain-indexer | `PositionSplit`, `PositionsMerge`, `PayoutRedemption` |
| Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | chain-indexer | (mercados de riesgo negativo) |
| UMA Adapter | `0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74` | resolution-watcher | `QuestionInitialized`, `QuestionResolved` |
| UMA Optimistic Oracle | `0xCB1822859cEF82Cd2Eb4E6276C7916e692995130` | resolution-watcher | `ProposePrice`, `DisputePrice`, `Settle` |

### 5.6 Chainlink Data Streams

- **Documentación oficial:** https://docs.chain.link/data-streams
- **Documentación de Automation:** https://docs.chain.link/chainlink-automation
- **Auth:** las price feeds on-chain son lectura pública. Para Data Streams off-chain (low-latency) se requiere registro.

Para el MVP usamos los **Price Feeds on-chain** (más simples), no Data Streams off-chain. Leemos los contratos directamente con `web3.py`. La interfaz estándar es `AggregatorV3Interface` con el método `latestRoundData()`.

**Feeds que nos interesan en Polygon:**

| Asset | Address en Polygon | Usado para |
|---|---|---|
| BTC/USD | `0xc907E116054Ad103354f2D350FD2514433D57F6f` | Cruzar con mercados sobre BTC |
| ETH/USD | `0xF9680D99D6C9589e2a93a78A04A279e509205945` | Cruzar con mercados sobre ETH |
| MATIC/USD | `0xAB594600376Ec9fD91F8e885dADF0CE036862dE0` | Cruzar con mercados sobre MATIC |

Lista completa de feeds en Polygon: https://docs.chain.link/data-feeds/price-feeds/addresses?network=polygon

### 5.7 UMA Oracle (más allá del contrato)

- **Documentación oficial:** https://docs.uma.xyz/
- **Portal web (UI oficial):** https://oracle.uma.xyz/
- **Repositorio del adapter:** https://github.com/Polymarket/uma-ctf-adapter

Solo se accede vía contratos on-chain (no hay API HTTP oficial necesaria para nuestro caso). El `resolution-watcher` escucha los eventos del `UMA Adapter` y del `UMA Optimistic Oracle`.

### 5.8 Fuentes de noticias

| Fuente | Tipo | URL/Endpoint | Coste |
|---|---|---|---|
| Reuters | RSS | https://www.reutersagency.com/feed/ | Gratis |
| Bloomberg | RSS | varios feeds por categoría | Gratis |
| Associated Press | RSS | https://apnews.com/ | Gratis |
| NewsAPI | HTTP REST | https://newsapi.org/v2/everything | Free tier: 100 req/día |
| GDELT | HTTP REST | https://api.gdeltproject.org/ | Gratis |

Para el MVP, RSS + NewsAPI free tier es suficiente.

---

## 6. Funcionalidad clave de la interfaz: visualización con gráficas

La interfaz se diseña con **gráficas como elemento central**, no como adorno. Las gráficas hacen intuitiva la información:

| Pantalla | Gráficas |
|---|---|
| Dashboard | Sparklines en KPIs, mini-gráficas de precio en tabla de mercados, mapa de calor de actividad por categoría |
| Market detail | Gráfica grande de precio YES/NO con overlay opcional de Chainlink, gráfica de volumen, gráfica de profundidad del orderbook |
| Resolution Watchdog | Timeline visual del ciclo de resolución (gantt-like), gráfica de distribución de bonds depositados |
| Signals | Gráficas comparativas de precio mercado vs señal externa, marcadores de divergencias |
| Ecosystem | Gráficas de líneas de volumen histórico, barras de mercados por categoría, scatter de calibración |

**Librerías de gráficas:**
- **TradingView Lightweight Charts** para gráficas de series temporales tipo trading (precio, volumen).
- **Recharts** para gráficas más simples (barras, pie, scatter).
- **Visx** o **D3** solo si hace falta algo muy custom (mapa de calor, timeline gantt).

---

## 7. Caché incremental — patrón clave

Para que las consultas sean rápidas, **todo se guarda y se actualiza solo lo nuevo**. Esto es el patrón "checkpoint":

1. La primera vez que se pide un mercado o contrato, se hace descarga completa.
2. Se guarda en la base de datos el "último bloque procesado" en una tabla `sync_state`.
3. Las consultas siguientes solo descargan desde ese bloque hasta el más reciente.
4. La presentación al usuario lee de la base de datos (rápida), no de la blockchain (lenta).

Esto aplica a:
- Indexación on-chain (último bloque por contrato).
- Sincronización de Gamma API (último timestamp por endpoint).
- Recolección de noticias (último timestamp por feed).

---

## 8. Roadmap MVP — 8 semanas

| Semana | Sprint | Entregable principal |
|---|---|---|
| 1 | Fundamentos | Conexiones a Polygon, Gamma API y Chainlink funcionando en scripts pequeños |
| 2 | chain-indexer | Indexador on-chain de CTF Exchange con checkpoint |
| 3 | market-syncer + schema | Base de datos completa y sincronización de Gamma/CLOB |
| 4 | resolution-watcher | Indexación de UMA Adapter + datos de resolución en DB |
| 5 | signals-collector + divergence-calculator | Lectura de Chainlink + RSS + cálculo de divergencias |
| 6 | FastAPI + Auth | Backend completo con JWT y todos los endpoints documentados en `/docs` |
| 7 | Frontend | Login + las 4 pantallas core (dashboard, market, resolution, signals) |
| 8 | Despliegue + presentación | Online con HTTPS, demo lista para GSR |

---

## 9. Limitaciones explícitas del MVP

Documentar lo que NO está incluido evita expectativas mal puestas:

- Solo Polygon (chain_id 137). No multi-chain.
- Solo Polymarket. No Kalshi, Limitless, etc.
- Sin LLMs para análisis de sentimiento (decisión consciente para acotar el alcance).
- Sin app móvil nativa. Solo web responsive.
- Sin alertas por email o push notifications. Solo dashboard reactivo.
- Sin trading. Lectura únicamente.

---

