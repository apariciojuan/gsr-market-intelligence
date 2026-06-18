# GSR Market Intelligence — API Contract

> Especificación completa de la API REST entre frontend y backend. Cada endpoint incluye método, path, query params, request body si aplica, response shape, códigos de error y la gráfica/pantalla del frontend a la que sirve.

**Stack:** FastAPI + Pydantic v2 + JWT (fastapi-users).
**Base URL en desarrollo:** `http://localhost:8000`
**Base URL en producción:** `https://gsr-mi.example.com/api`
**Documentación interactiva auto-generada:** `/docs` (Swagger UI).

---

## Convenciones generales

### Formato de petición y respuesta

- Content-Type: `application/json`.
- Encoding: UTF-8.
- Timestamps en ISO 8601 con timezone UTC: `2026-05-11T14:32:00Z`.
- Direcciones Ethereum en `lowercase`: `0x7a3f...`.
- Cantidades grandes (wei-like) como strings JSON: `"value_raw": "1500000000000000000"` (porque JavaScript pierde precisión con números > 2^53).
- Cantidades USD como números: `"value_usd": 1234.56`.
- Precios (0..1) como números con 4-8 decimales: `"price": 0.4231`.

### Autenticación

Todos los endpoints (excepto los marcados como **Público**) requieren JWT en el header:
```
Authorization: Bearer <token>
```

El token se obtiene en `POST /auth/jwt/login`. Expira en 24 horas (`JWT_EXPIRE_MINUTES=1440`).

### Errores estándar

Respuesta de error siempre con este shape:
```json
{
  "detail": "Human readable error message",
  "code": "ERROR_CODE",
  "field": "field_name_if_validation"
}
```

Códigos HTTP usados:

| Código | Significado | Cuándo |
|---|---|---|
| 200 | OK | Petición exitosa con cuerpo |
| 201 | Created | Recurso creado exitosamente |
| 202 | Accepted | Job encolado (indexación de contrato) |
| 204 | No Content | Operación exitosa sin cuerpo (DELETE) |
| 400 | Bad Request | Body inválido o parámetros mal formados |
| 401 | Unauthorized | Falta token JWT o expirado |
| 403 | Forbidden | Token válido pero sin permisos |
| 404 | Not Found | Recurso no existe |
| 409 | Conflict | Estado inconsistente (ej: usuario ya existe) |
| 422 | Unprocessable Entity | Validación Pydantic falla |
| 429 | Too Many Requests | Rate limit (no implementado en MVP) |
| 500 | Internal Server Error | Error inesperado del servidor |
| 503 | Service Unavailable | Dependencia caída (Polygon RPC, Redis) |

### Paginación

Endpoints que devuelven listas aceptan estos query params:

| Param | Tipo | Default | Notas |
|---|---|---|---|
| `limit` | int | 50 | Max 200 |
| `offset` | int | 0 | |
| `order` | string | `desc` | `asc` o `desc` |
| `order_by` | string | (depende del endpoint) | Campo de ordenación |

Respuesta paginada:
```json
{
  "items": [...],
  "total": 1234,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

---

## Tabla maestra de endpoints

| Método | Path | Auth | Para qué | Pantalla / Gráfica |
|---|---|---|---|---|
| POST | `/auth/register` | ⚠️ Disabled MVP | Registro | — |
| POST | `/auth/jwt/login` | Público | Login | `/login` |
| POST | `/auth/jwt/logout` | Sí | Logout | sidebar |
| GET | `/users/me` | Sí | Perfil propio | sidebar, settings |
| GET | `/health` | Público | Healthcheck | monitoring |
| GET | `/dashboard/summary` | Sí | Datos completos del dashboard | `/` |
| GET | `/dashboard/top-markets` | Sí | Top 10 mercados del día | `/` tabla |
| GET | `/dashboard/notable-divergences` | Sí | Cards de divergencia destacadas | `/` |
| GET | `/markets` | Sí | Listado paginado de mercados | `/markets` |
| GET | `/markets/search` | Sí | Búsqueda por keyword | global search |
| GET | `/markets/{slug}` | Sí | Detalle completo de un mercado | `/markets/[slug]` |
| GET | `/markets/{id}/prices` | Sí | Series temporales de precio + marcadores | G3, G4, G5 |
| GET | `/markets/{id}/sparkline` | Sí | Mini chart para tabla | G2 |
| GET | `/markets/{id}/orderbook` | Sí | Depth chart | G6 |
| GET | `/markets/{id}/holders` | Sí | Top holders | G7 + tab Holders |
| GET | `/markets/{id}/trades` | Sí | Histórico de trades | tab Trades |
| GET | `/markets/{id}/news` | Sí | Noticias asociadas | tab Signals |
| GET | `/markets/{id}/external-signals` | Sí | Señales RSS/resolution_source | research / tab Signals |
| GET | `/external-signals` | Sí | Lista paginada de señales externas | research |
| GET | `/external-signals/{id}` | Sí | Detalle de señal externa | research |
| POST | `/external-signals/collect` | Sí | Disparar ingesta RSS | research / workers |
| POST | `/contracts/explore` | Sí | Iniciar exploración de address | `/contracts/[address]` |
| GET | `/contracts/{address}` | Sí | Info detectada de un contrato | `/contracts/[address]` |
| GET | `/contracts/{address}/sync-status` | Sí | Estado de la indexación | polling tras explore |
| GET | `/contracts/{address}/summary` | Sí | Resumen agregado | `/contracts/[address]` header |
| GET | `/contracts/{address}/activity` | Sí | Buckets de actividad | G8, G9 |
| GET | `/contracts/{address}/transactions` | Sí | Listado de transacciones | `/contracts/[address]` tabla |
| GET | `/resolutions` | Sí | Tabla del Watchdog | `/resolutions` |
| GET | `/resolutions/{questionId}` | Sí | Detalle de un ciclo de resolución | `/resolutions/[questionId]`, G10 |
| GET | `/resolutions/stats` | Sí | Estadísticas agregadas | G11 |
| GET | `/signals` | Sí | Lista de divergencias activas | `/signals` |
| GET | `/signals/{id}` | Sí | Detalle de una divergencia | `/signals/[id]`, G13 |
| GET | `/ecosystem/kpis` | Sí | KPI strip del Ecosystem | `/ecosystem` |
| GET | `/ecosystem/kpi/{key}/sparkline` | Sí | Sparkline de un KPI | G1 |
| GET | `/ecosystem/volume` | Sí | Volumen total por intervalo | G14 |
| GET | `/ecosystem/active-markets` | Sí | Mercados activos en el tiempo | G15 |
| GET | `/ecosystem/by-category` | Sí | Breakdown por categoría | G16 |
| GET | `/ecosystem/calibration` | Sí | Scatter de calibración | G17 |
| GET | `/ecosystem/activity-heatmap` | Sí | Heatmap hora x día | G18 |
| GET | `/ecosystem/top-wallets` | Sí | Tabla de wallets más activas | `/ecosystem` |
| GET | `/search` | Sí | Búsqueda global agrupada | top bar ⌘K |

**Total: 35 endpoints REST.**

---

## 1. Autenticación

### `POST /auth/jwt/login`

**Auth:** público.

**Request body** (form-urlencoded, no JSON — lo requiere `fastapi-users`):
```
username=admin@gsr.com&password=xxxxx
```

**Response 200:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Errores:**
- 400 `LOGIN_BAD_CREDENTIALS` — email/password inválidos.

---

### `POST /auth/jwt/logout`

**Auth:** Bearer JWT.

**Response 204:** sin cuerpo.

---

### `GET /users/me`

**Auth:** Bearer JWT.

**Response 200:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@gsr.com",
  "display_name": "Admin",
  "is_active": true,
  "is_superuser": true,
  "is_verified": true,
  "created_at": "2026-05-01T10:00:00Z"
}
```

---

### `POST /auth/register`

**Auth:** público.

> **Disabled en MVP.** Los usuarios se crean manualmente con `scripts/create_user.py`. Este endpoint devuelve 403 si se llama. Habilitar en producción si en el futuro se quiere apertura.

---

## 2. Health

### `GET /health`

**Auth:** público.

**Response 200:**
```json
{
  "status": "ok",
  "database": "ok",
  "redis": "ok",
  "polygon_rpc": "ok",
  "version": "0.1.0",
  "uptime_seconds": 12345
}
```

**Response 503:** mismo shape pero con campos en `"degraded"` o `"down"`.

---

## 3. Dashboard `/`

### `GET /dashboard/summary`

**Auth:** Bearer JWT.

**Para:** Dashboard principal `/`. Devuelve **todo lo necesario para pintar la home en una sola llamada** (más eficiente que 4-5 llamadas).

**Query params:** ninguno.

**Response 200:**
```json
{
  "kpis": [
    {
      "key": "volume_24h",
      "label": "Volume 24h",
      "value": 8_647_323,
      "value_formatted": "$8.6M",
      "delta_pct": 12.3,
      "delta_direction": "up"
    },
    {
      "key": "active_markets",
      "label": "Active Markets",
      "value": 1247,
      "value_formatted": "1,247",
      "delta_pct": -2.1,
      "delta_direction": "down"
    },
    {
      "key": "pending_resolutions",
      "label": "Pending Resolutions",
      "value": 34,
      "value_formatted": "34",
      "delta_pct": null,
      "delta_direction": "neutral"
    },
    {
      "key": "divergences_today",
      "label": "Divergences Today",
      "value": 7,
      "value_formatted": "7",
      "delta_pct": null,
      "delta_direction": "neutral"
    },
    {
      "key": "active_users_24h",
      "label": "Active Wallets 24h",
      "value": 8421,
      "value_formatted": "8,421",
      "delta_pct": 5.2,
      "delta_direction": "up"
    }
  ],
  "active_resolutions": [
    {
      "question_id": "0xabc...",
      "market_question": "Will Trump win 2028?",
      "status": "disputed",
      "bond_usd": 750,
      "ends_in_seconds": 4980,
      "challenge_deadline": "2026-05-11T15:55:00Z"
    }
  ]
}
```

---

### `GET /dashboard/top-markets`

**Auth:** Bearer JWT.

**Para:** tabla "Top Markets — Last 24h" en `/`.

**Query params:**
- `limit` (default 10, max 50)
- `window` (default `24h`, valores: `1h`, `24h`, `7d`)

**Response 200:**
```json
{
  "items": [
    {
      "id": 12345,
      "slug": "will-trump-win-2028",
      "question": "Will Donald Trump win the 2028 Presidential Election?",
      "category": "Politics",
      "price_yes": 0.42,
      "price_no": 0.58,
      "delta_pct_24h": 3.2,
      "volume_24h_usd": 2_345_000,
      "end_date": "2028-11-03T00:00:00Z",
      "sparkline": [0.39, 0.40, 0.41, 0.40, 0.42, 0.42]
    }
  ],
  "total": 10
}
```

---

### `GET /dashboard/notable-divergences`

**Auth:** Bearer JWT.

**Para:** sección "Notable Divergences" en `/`.

**Query params:**
- `limit` (default 3, max 10)

**Response 200:** array de `DivergenceCard` (ver schema en sección Signals).

---

## 4. Markets

### `GET /markets`

**Auth:** Bearer JWT.

**Para:** `/markets` listado paginado.

**Query params:**
- Paginación estándar (`limit`, `offset`, `order`, `order_by`).
- `order_by`: `volume_total | liquidity | end_date | created_at` (default `volume_total`).
- `category` (opcional): filtrar por categoría.
- `active` (default `true`): `true | false | all`.
- `resolved` (default `false`): `true | false | all`.

**Response 200:**
```json
{
  "items": [
    {
      "id": 12345,
      "condition_id": "0xabc...",
      "slug": "will-trump-win-2028",
      "question": "Will Donald Trump win the 2028 Presidential Election?",
      "category": "Politics",
      "tags": ["politics", "elections"],
      "outcomes": ["Yes", "No"],
      "end_date": "2028-11-03T00:00:00Z",
      "volume_total": 24_300_000,
      "liquidity": 1_200_000,
      "active": true,
      "resolved": false
    }
  ],
  "total": 1247,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

---

### `GET /markets/search`

**Auth:** Bearer JWT.

**Para:** búsqueda de mercados por keyword.

**Query params:**
- `q` (required): keyword (mínimo 2 chars).
- `limit` (default 10).

**Response 200:** misma estructura que `/markets`.

---

### `GET /markets/{slug}`

**Auth:** Bearer JWT.

**Para:** `/markets/[slug]` Market Detail. **Endpoint pesado:** devuelve todo lo necesario para la pantalla en una sola llamada.

**Path params:**
- `slug` (string).

**Response 200:**
```json
{
  "market": {
    "id": 12345,
    "condition_id": "0xabc...",
    "question_id": "0xdef...",
    "slug": "will-trump-win-2028",
    "question": "Will Donald Trump win the 2028 Presidential Election?",
    "description": "This market resolves YES if Donald Trump is...",
    "category": "Politics",
    "tags": ["politics", "elections"],
    "outcomes": ["Yes", "No"],
    "outcome_token_ids": ["12345...", "67890..."],
    "market_address": "0x...",
    "image_url": "https://...",
    "start_date": "2024-01-01T00:00:00Z",
    "end_date": "2028-11-03T00:00:00Z",
    "resolved": false,
    "active": true,
    "volume_total": 24_300_000,
    "liquidity": 1_200_000,
    "uma_adapter_version": "v2",
    "uma_adapter_address": "0x6A9D...",
    "last_synced_at": "2026-05-11T14:00:00Z"
  },
  "stats": {
    "volume_24h_usd": 234_000,
    "volume_7d_usd": 1_240_000,
    "trader_count": 1456,
    "holder_count": 892,
    "open_interest_usd": 12_300_000
  },
  "current_prices": {
    "yes": { "price": 0.42, "bid": 0.41, "ask": 0.43, "midpoint": 0.42, "spread": 0.02 },
    "no":  { "price": 0.58, "bid": 0.57, "ask": 0.59, "midpoint": 0.58, "spread": 0.02 }
  },
  "linked_contracts": [
    { "address": "0xE111...", "type": "polymarket_ctf_exchange", "name": "CTF Exchange" }
  ],
  "has_chainlink_overlay": true,
  "chainlink_asset_pair": "BTC/USD"
}
```

**Errores:**
- 404 `MARKET_NOT_FOUND`.

---

### `GET /markets/{id}/prices`

**Auth:** Bearer JWT.

**Para:** alimenta gráficas G3 (Price History), G4 (Chainlink Overlay), G5 (Volume Bars).

**Path params:**
- `id` (int): market_id.

**Query params:**
- `interval` (required): `1m | 1h | 4h | 1d | 1w | max`.
- `from` (opcional): timestamp ISO. Default: depende del interval.
- `to` (opcional): timestamp ISO. Default: now.
- `include_markers` (default `true`): si incluir noticias y propuestas.
- `include_chainlink` (default `true`): si incluir overlay.
- `include_volume` (default `true`): si incluir serie de volumen.

**Response 200:**
```json
{
  "market_id": 12345,
  "interval": "1h",
  "from_time": "2026-05-10T14:00:00Z",
  "to_time": "2026-05-11T14:00:00Z",
  "series_yes": [
    { "t": "2026-05-10T14:00:00Z", "v": 0.41 },
    { "t": "2026-05-10T15:00:00Z", "v": 0.42 }
  ],
  "series_no": [
    { "t": "2026-05-10T14:00:00Z", "v": 0.59 },
    { "t": "2026-05-10T15:00:00Z", "v": 0.58 }
  ],
  "volume_series": [
    { "t": "2026-05-10T14:00:00Z", "v": 12340, "direction": "up" },
    { "t": "2026-05-10T15:00:00Z", "v": 8923, "direction": "down" }
  ],
  "chainlink_overlay": {
    "asset_pair": "BTC/USD",
    "feed_address": "0xc907...",
    "series": [
      { "t": "2026-05-10T14:00:00Z", "v": 67234.50 }
    ]
  },
  "markers": [
    {
      "t": "2026-05-10T16:30:00Z",
      "type": "news",
      "title": "Reuters: Trump leads in Iowa polls",
      "url": "https://reuters.com/...",
      "source": "reuters"
    },
    {
      "t": "2026-05-10T18:00:00Z",
      "type": "oracle_proposal",
      "proposer_address": "0x7a3f...",
      "bond_usd": 750,
      "outcome": "Yes"
    }
  ],
  "stats": {
    "min_yes": 0.34,
    "max_yes": 0.45,
    "avg_yes": 0.41,
    "total_volume_usd": 2_345_000
  }
}
```

---

### `GET /markets/{id}/sparkline`

**Auth:** Bearer JWT.

**Para:** G2 (mini chart en tablas).

**Query params:**
- `points` (default 30, max 100).
- `window` (default `24h`).

**Response 200:**
```json
{
  "values": [0.39, 0.40, 0.41, 0.40, 0.42, 0.42],
  "direction": "up"
}
```

---

### `GET /markets/{id}/orderbook`

**Auth:** Bearer JWT.

**Para:** G6 (Depth chart), tab Orderbook.

**Path params:** `id` (int).

**Query params:**
- `outcome` (default `yes`): `yes | no`.
- `depth` (default 20, max 100): número de niveles a devolver por lado.

**Response 200:**
```json
{
  "market_id": 12345,
  "outcome": "yes",
  "token_id": "12345...",
  "midpoint": 0.42,
  "spread": 0.02,
  "bids": [
    { "price": 0.41, "size": 500, "cumulative_size": 500 },
    { "price": 0.40, "size": 1000, "cumulative_size": 1500 }
  ],
  "asks": [
    { "price": 0.43, "size": 800, "cumulative_size": 800 },
    { "price": 0.44, "size": 1200, "cumulative_size": 2000 }
  ],
  "last_updated_at": "2026-05-11T14:00:00Z"
}
```

---

### `GET /markets/{id}/holders`

**Auth:** Bearer JWT.

**Para:** G7 (top holders bar), tab Holders.

**Path params:** `id` (int).

**Query params:**
- `limit` (default 50, max 200).
- `outcome` (opcional): filtrar por `yes | no`.

**Response 200:**
```json
{
  "items": [
    {
      "rank": 1,
      "address": "0x7a3f...",
      "address_label": null,
      "shares": "12000",
      "side": "yes",
      "avg_buy_price": 0.39,
      "value_usd": 5040,
      "realized_pnl_usd": 230,
      "unrealized_pnl_usd": 360,
      "first_buy_at": "2026-04-15T10:00:00Z"
    }
  ],
  "total": 892,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

---

### `GET /markets/{id}/trades`

**Auth:** Bearer JWT.

**Para:** tab Trades.

**Path params:** `id` (int).

**Query params:**
- Paginación estándar.
- `from`, `to` (timestamps ISO).
- `side` (opcional): `buy | sell`.

**Response 200:**
```json
{
  "items": [
    {
      "tx_hash": "0xdef...",
      "time": "2026-05-11T13:45:23Z",
      "side": "buy",
      "outcome": "yes",
      "price": 0.42,
      "size": 500,
      "value_usd": 210.00,
      "trader_address": "0x7a3f...",
      "block_number": 52_345_678
    }
  ],
  "total": 4_832,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

---

### `GET /external-signals`

**Auth:** Bearer JWT.

**Para:** investigación y auditoría de señales textuales (RSS, `resolution_source`).

**Query params:** `market_id`, `slug`, `source`, `since`, `until`, `q`, `limit`, `offset`.

**Response 200:** `{ items: ExternalSignalRead[], total, limit, offset, has_more }` donde cada item incluye `market_id`, `source`, `text`, `timestamp`, `url`.

### `POST /external-signals/collect`

**Body:** `{ "market_ids": [int], "slugs": [string] }` (opcionales; sin filtros = mercados activos).

**Response 200:** `{ markets_processed, signals_upserted }`.

---

### `GET /markets/{id}/news`

**Auth:** Bearer JWT.

**Para:** tab Signals del market detail (mapeado desde `external_signals` persistidas).

**Path params:** `id` (int).

**Query params:**
- `limit` (default 20, max 100).
- `min_relevance` (default 0.5): float 0..1.
- `from`, `to` (timestamps ISO).

**Response 200:**
```json
{
  "items": [
    {
      "news": {
        "id": 9876,
        "source": "reuters",
        "url": "https://reuters.com/...",
        "title": "Trump leads in Iowa polls",
        "summary": "...",
        "published_at": "2026-05-10T16:30:00Z",
        "language": "en"
      },
      "signal": {
        "relevance_score": 0.87,
        "method": "cosine_similarity"
      }
    }
  ],
  "total": 142
}
```

---

## 5. Contracts (explorador)

### `POST /contracts/explore`

**Auth:** Bearer JWT.

**Para:** iniciar la exploración de una address. Si ya está indexada y reciente, devuelve los datos directamente; si no, encola un job y devuelve `job_id`.

**Request body:**
```json
{
  "address": "0xE111180000d2663C0091e4f400237545B87B996B",
  "from_block": null,
  "to_block": null
}
```

**Response 200** (ya cacheado):
```json
{
  "status": "ready",
  "address": "0xe111180000d2663c0091e4f400237545b87b996b",
  "contract": { /* ContractRead */ }
}
```

**Response 202** (job encolado):
```json
{
  "status": "queued",
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "address": "0xe111180000d2663c0091e4f400237545b87b996b",
  "estimated_seconds": 45
}
```

**Errores:**
- 400 `INVALID_ADDRESS` — no es una address válida de Polygon.
- 503 `RPC_UNAVAILABLE` — Polygon RPC caído.

---

### `GET /contracts/{address}`

**Auth:** Bearer JWT.

**Para:** info detectada del contrato (header de la pantalla).

**Path params:**
- `address` (string, validada con regex).

**Response 200:**
```json
{
  "id": 42,
  "address": "0xe111180000d2663c0091e4f400237545b87b996b",
  "chain_id": 137,
  "contract_type": "polymarket_ctf_exchange",
  "name": "CTF Exchange",
  "symbol": null,
  "decimals": null,
  "abi_key": "ctf_exchange",
  "first_seen_block": 18_000_000,
  "metadata_json": {
    "deployer": "0x...",
    "deployment_tx": "0x..."
  },
  "polygonscan_url": "https://polygonscan.com/address/0xe111180000d2663c0091e4f400237545b87b996b",
  "linked_market": null,
  "created_at": "2026-05-01T10:00:00Z"
}
```

**Si el contrato corresponde a un mercado:**
```json
{
  "...": "...",
  "linked_market": {
    "id": 12345,
    "slug": "will-trump-win-2028",
    "question": "Will Donald Trump win the 2028 Presidential Election?"
  }
}
```

---

### `GET /contracts/{address}/sync-status`

**Auth:** Bearer JWT.

**Para:** polling tras `POST /explore` para saber si la indexación terminó.

**Response 200:**
```json
{
  "address": "0xe111...",
  "sync_status": "syncing",
  "progress_pct": 67.5,
  "last_block_processed": 52_001_350,
  "current_polygon_block": 52_002_000,
  "blocks_remaining": 650,
  "events_found": 4_832,
  "started_at": "2026-05-11T14:00:00Z",
  "estimated_completion_at": "2026-05-11T14:00:45Z",
  "error_message": null
}
```

**Estados posibles de `sync_status`:**
- `idle` — nunca se ha sincronizado.
- `syncing` — sincronización en curso.
- `completed` — sincronización al día.
- `error` — fallo (ver `error_message`).

---

### `GET /contracts/{address}/summary`

**Auth:** Bearer JWT.

**Para:** header de la pantalla `/contracts/[address]`.

**Response 200:**
```json
{
  "contract": { /* ContractRead */ },
  "total_transactions": 4_832_109,
  "unique_wallets": 142_847,
  "total_volume_usd": 8_647_323_000,
  "first_activity": "2021-06-15T12:34:56Z",
  "last_activity": "2026-05-11T13:59:00Z",
  "is_polymarket_market": false,
  "linked_market": null
}
```

---

### `GET /contracts/{address}/activity`

**Auth:** Bearer JWT.

**Para:** G8 (Contract Activity) y G9 (Unique Wallets Daily).

**Query params:**
- `interval` (default `1d`): `1h | 1d | 1w | 1m`.
- `from`, `to` (timestamps ISO).

**Response 200:**
```json
{
  "address": "0xe111...",
  "interval": "1d",
  "from_time": "2026-04-11T00:00:00Z",
  "to_time": "2026-05-11T00:00:00Z",
  "buckets": [
    {
      "t": "2026-04-11T00:00:00Z",
      "tx_count": 234,
      "unique_senders": 89,
      "volume_usd": 45000
    }
  ]
}
```

---

### `GET /contracts/{address}/transactions`

**Auth:** Bearer JWT.

**Para:** tabla de transacciones en `/contracts/[address]`.

**Query params:**
- Paginación estándar.
- `event_name` (opcional): filtrar por nombre de evento.
- `from_address`, `to_address` (opcional): filtrar por wallet.
- `from`, `to` (timestamps).

**Response 200:**
```json
{
  "items": [
    {
      "tx_hash": "0xdef...",
      "log_index": 3,
      "block_number": 52_001_234,
      "time": "2026-05-11T13:45:23Z",
      "event_name": "OrderFilled",
      "from_address": "0x7a3f...",
      "to_address": "0xa92...",
      "decoded_args": {
        "orderHash": "0x...",
        "maker": "0x7a3f...",
        "taker": "0xa92...",
        "makerAssetId": "...",
        "takerAssetId": "...",
        "makerAmountFilled": "500000000",
        "takerAmountFilled": "1190476190",
        "fee": "0"
      },
      "value_usd": 210.00,
      "polygonscan_url": "https://polygonscan.com/tx/0xdef..."
    }
  ],
  "total": 4_832_109,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

---

## 6. Resolutions (Watchdog)

### `GET /resolutions`

**Auth:** Bearer JWT.

**Para:** tabla principal del Resolution Watchdog `/resolutions`.

**Query params:**
- Paginación estándar.
- `status` (opcional): `pending | proposed | disputed | resolved | all` (default `all`).
- `ends_within_hours` (opcional): filtrar por challenge window que termina pronto.
- `min_bond_usd` (opcional).
- `q` (opcional): búsqueda por question text.

**Response 200:**
```json
{
  "items": [
    {
      "id": 789,
      "question_id": "0xabc...",
      "market_id": 12345,
      "market_question": "Will Trump win 2028?",
      "market_slug": "will-trump-win-2028",
      "adapter_version": "v2",
      "adapter_address": "0x6A9D...",
      "status": "disputed",
      "proposer_address": "0x7a3f...",
      "disputer_address": "0xa92f...",
      "proposed_outcome": "Yes",
      "bond_usd": 750,
      "counter_bond_usd": 750,
      "request_timestamp": "2026-05-11T12:00:00Z",
      "proposal_timestamp": "2026-05-11T12:30:00Z",
      "challenge_deadline": "2026-05-11T14:30:00Z",
      "seconds_remaining": 480,
      "uma_oracle_url": "https://oracle.uma.xyz/request?...",
      "is_urgent": true
    }
  ],
  "total": 34,
  "limit": 50,
  "offset": 0,
  "has_more": false
}
```

**Campos derivados a calcular en backend:**
- `seconds_remaining`: solo si `status != resolved`.
- `is_urgent`: `true` si `seconds_remaining < 1800` (30 min) y `status == proposed`.

---

### `GET /resolutions/{questionId}`

**Auth:** Bearer JWT.

**Para:** `/resolutions/[questionId]` y G10 (Resolution Timeline).

**Path params:**
- `questionId` (string, bytes32 hex).

**Response 200:**
```json
{
  "question_id": "0xabc...",
  "market": { /* MarketRead opcional */ },
  "current_phase": "challenge",
  "is_disputed": false,
  "is_resolved": false,
  "ancillary_data_decoded": "This market resolves YES if...",
  "timeline": [
    {
      "phase": "initialized",
      "timestamp": "2026-05-11T12:00:00Z",
      "completed": true,
      "data": {
        "creator": "0x...",
        "reward_token": "0xC011...",
        "reward_usd": 5
      },
      "tx_hash": "0x..."
    },
    {
      "phase": "proposed",
      "timestamp": "2026-05-11T12:30:00Z",
      "completed": true,
      "data": {
        "proposer": "0x7a3f...",
        "bond_usd": 750,
        "outcome": "Yes"
      },
      "tx_hash": "0x..."
    },
    {
      "phase": "challenge",
      "timestamp": "2026-05-11T12:30:00Z",
      "completed": false,
      "data": {
        "deadline": "2026-05-11T14:30:00Z",
        "seconds_remaining": 480
      }
    },
    {
      "phase": "dvm_vote",
      "timestamp": null,
      "completed": false,
      "data": null
    },
    {
      "phase": "resolved",
      "timestamp": null,
      "completed": false,
      "data": null
    }
  ],
  "dispute": null,
  "market_impact_chart": {
    "from_time": "2026-05-11T10:00:00Z",
    "to_time": "2026-05-11T14:30:00Z",
    "price_series_yes": [
      { "t": "...", "v": 0.41 }
    ]
  },
  "uma_oracle_url": "https://oracle.uma.xyz/request?..."
}
```

**Errores:**
- 404 `RESOLUTION_NOT_FOUND`.

---

### `GET /resolutions/stats`

**Auth:** Bearer JWT.

**Para:** G11 (Bond Distribution) y banner de stats arriba de la tabla.

**Query params:**
- `window` (default `30d`): `7d | 30d | 90d | 1y | all`.

**Response 200:**
```json
{
  "window": "30d",
  "total_resolutions": 234,
  "disputed_count": 12,
  "dispute_rate_pct": 5.1,
  "avg_resolution_seconds": 8400,
  "bond_histogram": [
    { "bucket": "0-100", "count": 4 },
    { "bucket": "100-500", "count": 89 },
    { "bucket": "500-1000", "count": 134 },
    { "bucket": "1000-5000", "count": 6 },
    { "bucket": "5000+", "count": 1 }
  ]
}
```

---

## 7. Signals (divergencias)

### `GET /signals`

**Auth:** Bearer JWT.

**Para:** `/signals` lista de divergencias.

**Query params:**
- Paginación estándar.
- `divergence_type` (opcional): `price_gap_vs_chainlink | news_not_reflected | sudden_move_no_signal | chainlink_move_no_market | all`.
- `min_severity` (default 1, range 1-5).
- `status` (default `active`): `active | closed | all`.

**Response 200:**
```json
{
  "items": [
    {
      "divergence": {
        "id": 456,
        "market_id": 12345,
        "divergence_type": "price_gap_vs_chainlink",
        "detected_at": "2026-05-11T12:00:00Z",
        "last_updated_at": "2026-05-11T13:50:00Z",
        "severity": 4,
        "magnitude_pct": 12.3,
        "direction": "market_below",
        "market_value": 0.32,
        "external_value": 0.45,
        "external_source": "chainlink_btc_usd",
        "time_window_minutes": 60,
        "status": "active"
      },
      "market": {
        "id": 12345,
        "slug": "btc-200k-eoy-2026",
        "question": "Will Bitcoin reach $200k by EOY 2026?",
        "category": "Crypto"
      },
      "mini_chart_data": {
        "market_series": [{ "t": "...", "v": 0.32 }],
        "external_series": [{ "t": "...", "v": 0.45 }]
      }
    }
  ],
  "total": 7,
  "limit": 50,
  "offset": 0,
  "has_more": false
}
```

---

### `GET /signals/{id}`

**Auth:** Bearer JWT.

**Para:** vista detalle y G13 (Market vs Chainlink detail).

**Response 200:**
```json
{
  "divergence": { /* DivergenceRead completo */ },
  "market": { /* MarketRead */ },
  "market_series": [
    { "t": "2026-05-10T14:00:00Z", "v": 0.32 }
  ],
  "external_series": [
    { "t": "2026-05-10T14:00:00Z", "v": 67234.50 }
  ],
  "detection_point": {
    "t": "2026-05-11T12:00:00Z",
    "market_value": 0.32,
    "external_value": 0.45,
    "magnitude_pct": 12.3
  },
  "related_news": [
    { /* NewsItemRead */ }
  ]
}
```

---

## 8. Ecosystem

### `GET /ecosystem/kpis`

**Auth:** Bearer JWT.

**Para:** KPI strip del `/ecosystem`.

**Query params:**
- `window` (default `24h`).

**Response 200:**
```json
{
  "kpis": [
    {
      "key": "total_volume_24h",
      "label": "Total Volume 24h",
      "value": 8_647_323,
      "value_formatted": "$8.6M",
      "delta_pct": 12.3,
      "delta_direction": "up"
    }
  ]
}
```

---

### `GET /ecosystem/kpi/{key}/sparkline`

**Auth:** Bearer JWT.

**Para:** G1 (sparkline en cada KPI Card).

**Path params:**
- `key`: identifier del KPI.

**Query params:**
- `points` (default 30, max 100).

**Response 200:**
```json
{
  "key": "total_volume_24h",
  "values": [8_234_000, 8_456_000, 8_647_323],
  "direction": "up"
}
```

---

### `GET /ecosystem/volume`

**Auth:** Bearer JWT.

**Para:** G14 (Ecosystem Volume).

**Query params:**
- `interval` (default `1d`): `1d | 1w | 1m`.
- `from`, `to` (ISO).

**Response 200:**
```json
{
  "interval": "1d",
  "from_time": "2026-04-11T00:00:00Z",
  "to_time": "2026-05-11T00:00:00Z",
  "buckets": [
    { "t": "2026-04-11T00:00:00Z", "volume_usd": 1234000, "new_markets": 12 }
  ]
}
```

---

### `GET /ecosystem/active-markets`

**Auth:** Bearer JWT.

**Para:** G15.

**Query params:** mismo formato que `/volume`.

**Response 200:**
```json
{
  "interval": "1d",
  "buckets": [
    { "t": "2026-04-11T00:00:00Z", "active_count": 1234 }
  ]
}
```

---

### `GET /ecosystem/by-category`

**Auth:** Bearer JWT.

**Para:** G16.

**Query params:**
- `window` (default `30d`).

**Response 200:**
```json
{
  "window": "30d",
  "total_volume_usd": 45_000_000,
  "categories": [
    {
      "name": "Politics",
      "volume_usd": 18_000_000,
      "share_pct": 40.0,
      "color": "#A855F7"
    }
  ]
}
```

---

### `GET /ecosystem/calibration`

**Auth:** Bearer JWT.

**Para:** G17 (la gráfica estrella del Ecosystem).

**Query params:**
- `window` (default `all`): `90d | 1y | all`.
- `category` (default `all`).

**Response 200:**
```json
{
  "window": "all",
  "category": "all",
  "markets_count": 1234,
  "markets": [
    {
      "id": 42,
      "slug": "...",
      "question": "...",
      "implied_prob_avg": 0.65,
      "outcome": 1,
      "category": "politics",
      "volume_usd": 24000
    }
  ],
  "buckets": [
    {
      "range": "0-10%",
      "predicted_avg": 0.05,
      "actual_rate": 0.04,
      "count": 234
    }
  ],
  "overall_brier_score": 0.187
}
```

---

### `GET /ecosystem/activity-heatmap`

**Auth:** Bearer JWT.

**Para:** G18 (opcional).

**Query params:**
- `window` (default `30d`).

**Response 200:**
```json
{
  "window": "30d",
  "matrix": [
    { "day": 0, "hour": 0, "tx_count": 234 },
    { "day": 0, "hour": 1, "tx_count": 189 }
  ]
}
```

(168 puntos: 7 días × 24 horas.)

---

### `GET /ecosystem/top-wallets`

**Auth:** Bearer JWT.

**Para:** tabla de top wallets en `/ecosystem`.

**Query params:**
- `limit` (default 20, max 100).
- `order_by` (default `volume`): `volume | pnl | trades | success_rate`.
- `window` (default `30d`).

**Response 200:**
```json
{
  "items": [
    {
      "address": "0x7a3f...",
      "address_label": null,
      "total_volume_usd": 234_000,
      "trade_count": 423,
      "market_count": 87,
      "realized_pnl_usd": 12_300,
      "success_rate_pct": 67.4,
      "first_seen_at": "2024-08-15T10:00:00Z"
    }
  ],
  "total": 234,
  "limit": 20,
  "offset": 0,
  "has_more": true
}
```

---

## 9. Búsqueda global

### `GET /search`

**Auth:** Bearer JWT.

**Para:** la búsqueda global con ⌘K en la top bar.

**Query params:**
- `q` (required, min 2 chars).
- `limit_per_group` (default 3, max 10).

**Response 200:**
```json
{
  "query": "trump",
  "results": {
    "markets": [
      {
        "id": 12345,
        "slug": "will-trump-win-2028",
        "question": "Will Donald Trump win the 2028 Presidential Election?",
        "category": "Politics"
      }
    ],
    "wallets": [
      {
        "address": "0xtrump...",
        "label": null,
        "total_volume_usd": 234_000
      }
    ],
    "contracts": [
      {
        "address": "0x...",
        "type": "polymarket_market",
        "name": "Will Trump win 2028"
      }
    ],
    "tags": [
      { "name": "trump", "market_count": 23 },
      { "name": "us-politics", "market_count": 89 }
    ]
  }
}
```

---

## 10. Códigos de error específicos

Lista compacta de códigos de error para que el frontend pueda mostrarlos traducidos:

| Código | HTTP | Descripción |
|---|---|---|
| `INVALID_ADDRESS` | 400 | La dirección no es una address válida de Polygon |
| `INVALID_TX_HASH` | 400 | El tx hash no es válido |
| `INVALID_INTERVAL` | 400 | El intervalo solicitado no está soportado |
| `INVALID_DATE_RANGE` | 400 | `from > to` o rango demasiado amplio |
| `LOGIN_BAD_CREDENTIALS` | 400 | Email o password incorrectos |
| `LOGIN_USER_NOT_VERIFIED` | 400 | Usuario no verificado (no aplica en MVP) |
| `TOKEN_EXPIRED` | 401 | JWT caducado, hacer login de nuevo |
| `TOKEN_INVALID` | 401 | JWT corrupto o firma incorrecta |
| `INSUFFICIENT_PERMISSIONS` | 403 | Token válido sin permisos para esta acción |
| `MARKET_NOT_FOUND` | 404 | Mercado no existe (por id o slug) |
| `CONTRACT_NOT_FOUND` | 404 | Contrato no encontrado |
| `RESOLUTION_NOT_FOUND` | 404 | Resolución no encontrada |
| `DIVERGENCE_NOT_FOUND` | 404 | Divergencia no encontrada |
| `JOB_NOT_FOUND` | 404 | Job de exploración no encontrado |
| `USER_ALREADY_EXISTS` | 409 | Email ya registrado |
| `VALIDATION_ERROR` | 422 | Body de request no pasa validación Pydantic |
| `RPC_UNAVAILABLE` | 503 | Polygon RPC caído o timeout |
| `DATABASE_UNAVAILABLE` | 503 | BD no responde |

---

## 11. Notas de implementación para el backend

### Estrategia de carga

- Endpoints **"pesados"** que devuelven todo lo necesario para una pantalla en una llamada: `/markets/{slug}`, `/dashboard/summary`, `/resolutions/{questionId}`. Reducen latencia de la UI a costa de respuestas más grandes.
- Endpoints **"granulares"** que sirven datos específicos: `/markets/{id}/prices`, `/markets/{id}/holders`. Permiten que el frontend pida solo lo que necesita y use cache de React Query.

### Caching recomendado

| Endpoint | Cache | TTL |
|---|---|---|
| `/dashboard/summary` | Redis | 60s |
| `/markets` (listado) | Redis | 60s |
| `/markets/{slug}` | Redis | 30s |
| `/markets/{id}/prices` | Redis por `(id, interval, from, to)` | 60s |
| `/markets/{id}/orderbook` | NO cache, datos en vivo | — |
| `/resolutions` | Redis | 30s |
| `/resolutions/{questionId}` | Redis | 30s |
| `/ecosystem/*` | Redis | 5 min |

### Validación

- Todos los inputs pasan por Pydantic schemas en `app/schemas/`.
- Addresses se normalizan a lowercase **antes** de cualquier query a la BD.
- Timestamps siempre con timezone (UTC). Sin timezone → rechazar con 400.

### Paginación a tener en cuenta

- `total` en respuestas paginadas requiere un `COUNT(*)` extra que puede ser caro en tablas grandes. Para hypertables, considerar usar `total: null` y solo `has_more` para tablas masivas (transactions, trades). El frontend ya está preparado para esto.

### Endpoints WebSocket (futuro, fuera del MVP)

Reservar las rutas `/ws/markets/{id}/prices` y `/ws/resolutions/{questionId}` para añadir streaming en tiempo real en una iteración posterior. No implementar en el MVP, polling cada 30s al endpoint REST es suficiente.

---

## 12. Checklist de implementación

Para la persona del backend (persona 3), este es el orden recomendado de implementación dentro del Sprint 6:

1. **Auth** (`/auth/jwt/login`, `/users/me`, `/health`) — Día 1.
2. **Markets básicos** (`/markets`, `/markets/{slug}`, `/markets/search`) — Día 2.
3. **Gráficas de mercado** (`/markets/{id}/prices`, `/sparkline`, `/orderbook`, `/holders`, `/trades`, `/news`) — Día 3.
4. **Contracts** (`/explore`, `/sync-status`, `/summary`, `/activity`, `/transactions`) — Día 4.
5. **Resolutions** (`/resolutions`, `/resolutions/{id}`, `/stats`) — Día 5.
6. **Signals** (`/signals`, `/signals/{id}`) — Día 6.
7. **Ecosystem** (todos los `/ecosystem/*`) — Día 7.
8. **Dashboard + Search** (`/dashboard/*`, `/search`) — Día 7-8.

A medida que se implementa cada endpoint, debe aparecer en `/docs` (Swagger UI) y tener al menos un test en `tests/test_api/`.

---

## 13. Anexo: tipos compartidos

Schemas Pydantic reutilizables (referenciados en el `DATABASE_SPEC.md` con detalle):

- `MarketRead`, `MarketListItem`
- `ContractRead`
- `TransactionRead`
- `OracleProposalRead`, `OracleDisputeRead`
- `DivergenceRead`, `DivergenceCard`
- `NewsItemRead`, `NewsSignalRead`, `NewsWithSignal`
- `ChainlinkPricePoint`, `ChainlinkFeedRead`
- `PricePoint`, `PriceSeries`
- `Paginated[T]`, `PaginationParams`

Todos definidos en `backend/app/schemas/`.
