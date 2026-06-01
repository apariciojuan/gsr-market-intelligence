# Polymarket API Ingestion Plan

Documento de referencia para el worker de ingesta de Polymarket. El objetivo es reducir limpieza, evitar llamadas redundantes y guardar solo los campos utiles para el MVP.

## 1. Validacion contra la documentacion oficial

La documentacion publica de Polymarket confirma que existen tres APIs separadas:

- Gamma API: `https://gamma-api.polymarket.com`
- CLOB API: `https://clob.polymarket.com`
- Data API: `https://data-api.polymarket.com`

Tambien confirma que la Gamma API y la Data API son publicas, sin autenticacion para lectura.

### 1.1 Mapa de opciones confirmado

| API | Endpoint | Estado | Observacion |
|---|---|---|---|
| Gamma | `GET /events` | Confirmado | Soporta `active`, `closed`, `slug`, `tag_id`, `exclude_tag_id`, `related_tags`, `liquidity_min`, `volume_min`, `limit`, `offset`, `order`, `ascending`. |
| Gamma | `GET /markets` | Confirmado | Soporta filtros por `slug`, `clob_token_ids`, `condition_ids`, `tag_id`, `related_tags`, `closed`, `liquidity_num_min`, `volume_num_min`, `limit`, `offset`, `order`, `ascending`. |
| Gamma | `GET /tags` | Confirmado | Sirve para obtener el arbol de tags relevante sin descargar categorias redundantes. |
| CLOB | `GET /prices` | Confirmado | Devuelve precios de varios token IDs en una sola llamada mediante query parameters. |
| CLOB | `POST /prices` | Confirmado | Devuelve precios de varios token IDs en request body. Es la opcion preferida para batching. |
| CLOB | `GET /book` | Confirmado | Devuelve bids, asks, market details y last trade price. |
| CLOB | `GET /prices-history` | Confirmado | Historico de precios para un market/token, con `market`, `startTs`, `endTs`, `interval`, `fidelity`. |
| CLOB | `POST /batch-prices-history` | Confirmado | Historico de precios para varios markets en una sola llamada. Maximo 20 markets. |
| CLOB | `GET /midpoint` | Confirmado | Existe, pero es opcional si el midpoint se calcula desde el book. |
| CLOB | `GET /spread` | Confirmado | Existe, pero es opcional si el spread se calcula desde el book. |
| Data | `GET /trades` | Confirmado | Soporta `user`, `market`, `side`, `limit`, `offset`, `takerOnly`, `filterType`, `filterAmount`. |
| Data | `GET /holders` | Confirmado | Soporta `market` y `limit` con tope de 20 holders por token. |
| Data | `GET /activity` | Confirmado | Soporta `user`, `market`, `type`, `start`, `end`, `side`, `limit`, `offset`, `sortBy`, `sortDirection`. |
| Data | `GET /positions` | Confirmado | Util para vista de wallet, aunque no es imprescindible para el MVP de mercados. |
| Data | `GET /value` | Confirmado | Devuelve el valor total de posiciones de una wallet. |

### 1.2 Matices importantes

- `conditionId` existe en la API en camelCase. Si el backend usa snake_case internamente, se puede normalizar al persistir.
- `clobTokenIds` aparece en el objeto market, no como campo propio de cada outcome en la documentacion publica de Gamma.
- `resolutionSource` y `description` estan disponibles y deben guardarse porque alimentan la capa de external signals y la lectura de reglas del mercado.
- `icon`, `image`, `banner` existen en la respuesta, pero no aportan valor al MVP y se ignoran.
- La lista de tags no debe reconstruirse desde categorias anidadas profundas. Si se necesita clasificacion, se parte de `GET /tags` y, si hace falta, de `related_tags`.

## 2. Principios de ingesta

1. Filtrar en origen siempre que sea posible.
2. Reusar checkpoints para no volver a leer historicos ya procesados.
3. Hacer batching por token y por market en vez de llamadas individuales.
4. Guardar solo lo que se consume en UI, analytics y resolucion.
5. Descartar payloads grandes con `extra="ignore"` en Pydantic.

## 3. Flujo de datos propuesto

### 3.1 Descubrimiento de mercados con Gamma

Fuente principal para poblar el catalogo local.

#### Request base

```bash
GET https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&offset=0
```

#### Filtros que si vamos a usar

- `active=true` para traer solo mercados abiertos o vigentes.
- `closed=false` para evitar mercados resueltos en el flujo principal.
- `tag_id` cuando el usuario navegue por categorias o deportes.
- `related_tags=true` solo cuando queramos expandir el arbol de tags de forma controlada.
- `exclude_tag_id` si queremos cortar ruido de subarboles concretos.
- `liquidity_min` y `volume_min` para descartar mercados con liquidez o volumen irrelevantes.
- `slug` para lookup directo por URL.
- `order` y `ascending` para priorizar por `volume_24hr`, `volume`, `liquidity` o fechas.

#### Campos que si se guardan

- `id`
- `slug`
- `title`
- `description`
- `resolutionSource`
- `conditionId`
- `clobTokenIds`
- `outcomes`
- `outcomePrices`
- `active`
- `closed`
- `liquidity`
- `volume`
- `volume24hr`
- `bestBid`
- `bestAsk`
- `lastTradePrice`

#### Campos que se ignoran

- `icon`
- `image`
- `banner` o equivalentes visuales secundarios
- arrays de categorias profundamente anidadas cuando no se usen para filtros
- campos de UI que solo duplican informacion ya derivada

#### Logica

1. Leer eventos paginados.
2. Expandir cada evento a sus mercados asociados.
3. Persistir o actualizar el catalogo local por `conditionId` y `slug`.
4. Extraer el mapeo `conditionId -> clobTokenIds`.
5. Registrar `resolutionSource` y `description` para la capa de external signals.

### 3.2 Mapeo de tokens y mercados

El identificador central del sistema es `conditionId`.

Uso esperado:

- Polymarket Gamma: identifica el mercado a nivel de catalogo.
- CLOB: usa el token ID derivado de `clobTokenIds` para precios, book e historicos.
- Data API: usa el mismo `conditionId` para trades, holders y activity por mercado.
- Chain / resolucion: sirve para enlazar con CTF Exchange y UMA Adapter.

Esto implica una tabla de mapeo local, al menos con:

- `condition_id`
- `market_id`
- `slug`
- `clob_token_ids`
- `outcomes`
- `resolution_source`

### 3.3 Precios actuales con CLOB

Para precios en pantalla y widgets de mercado no se debe hacer una llamada por token.

#### Opcion preferida: batch

```bash
POST https://clob.polymarket.com/prices
```

Request body con multiples `token_id` y `side`.

Ventaja:

- una sola respuesta para varios tokens
- menos latencia
- menos riesgo de rate limit
- mapeo directo `token_id -> precio`

#### Opcion alternativa: query parameters

`GET /prices` existe y devuelve precios de varios token IDs, pero el flujo normal deberia preferir `POST /prices` cuando se construyan lotes desde backend.

#### Uso recomendado

1. Resolver todos los `clobTokenIds` de los mercados visibles.
2. Pedir precios en lote.
3. Normalizar la respuesta en memoria.
4. Persistir solo si hace falta cache o series temporales cortas.

### 3.4 Order book y profundidad

Endpoint:

```bash
GET https://clob.polymarket.com/book?token_id=X
```

La respuesta incluye:

- `bids`
- `asks`
- `market`
- `asset_id`
- `last_trade_price`
- `tick_size`
- `min_order_size`

Uso:

- pintar la profundidad top 10 a 20 niveles por lado
- calcular spread y midpoint localmente
- mostrar liquidez inmediata

No hace falta llamar a `GET /midpoint` ni a `GET /spread` si ya se tiene el book, salvo que se quiera comparar o simplificar una lectura puntual.

### 3.5 Historico de precios

#### Un solo market/token

```bash
GET https://clob.polymarket.com/prices-history?market=X&interval=1h&fidelity=1
```

Parametros soportados:

- `market` obligatorio
- `startTs` opcional
- `endTs` opcional
- `interval` opcional: `max`, `all`, `1m`, `1w`, `1d`, `6h`, `1h`
- `fidelity` opcional, en minutos

#### Multiples markets

```bash
POST https://clob.polymarket.com/batch-prices-history
```

Esto permite traer historicos de varios markets a la vez, con limite de 20.

#### Estrategia de checkpoint

1. Leer el ultimo timestamp almacenado en `sync_state`.
2. Pasar `startTs` o `endTs` cuando el endpoint lo permita.
3. Si la respuesta llega ya ordenada, cortar la paginacion o el procesamiento en cuanto aparezca un timestamp menor o igual al checkpoint.
4. Insertar solo los nuevos puntos.

#### Recomendacion de uso

- `1h` para vistas intradia y refresco rapido.
- `1d` para historicos largos en UI.
- `1w`, `1m` o `max` solo para backfills o pantallas de contexto amplio.

### 3.6 Trades, holders y actividad con Data API

#### Trades de mercado

Endpoint:

```bash
GET https://data-api.polymarket.com/trades
```

Parametros confirmados:

- `market` para filtrar por `conditionId`
- `user` para ver trades de una wallet concreta
- `side` para BUY o SELL
- `limit`
- `offset`
- `takerOnly`
- `filterType`
- `filterAmount`

Uso recomendado:

- pestaña de trades del detalle de mercado
- explorador de wallet cuando el usuario quiera ver su historial de ejecuciones
- refresco incremental por timestamp o por pagina, segun el orden de la respuesta

Campos utiles a persistir:

- `proxyWallet`
- `timestamp`
- `conditionId`
- `side`
- `size`
- `price`
- `transactionHash`
- `asset`
- `outcomeIndex`
- `title`
- `slug`

#### Holders

Endpoint:

```bash
GET https://data-api.polymarket.com/holders?market=X&limit=20
```

Notas:

- `market` es obligatorio.
- `limit` tiene tope de 20.
- la respuesta ya esta pensada para el top holders del token.

Uso:

- top holders por mercado
- panel lateral de concentracion

Campos utiles:

- `proxyWallet`
- `amount`
- `name`
- `pseudonym`
- `outcomeIndex`
- `displayUsernamePublic`

#### Activity de wallet

Endpoint:

```bash
GET https://data-api.polymarket.com/activity?user=0x...&limit=50&offset=0
```

Parametros confirmados:

- `user` obligatorio
- `limit` con maximo 500
- `offset` con maximo 1000
- `market`
- `type` con valores `TRADE`, `SPLIT`, `MERGE`, `REDEEM`, `REWARD`, `CONVERSION`, `MAKER_REBATE`, `REFERRAL_REWARD`
- `start`
- `end`
- `side`
- `sortBy` con `TIMESTAMP`, `TOKENS`, `CASH`
- `sortDirection` con `ASC` o `DESC`

Uso:

- explorer de wallet
- historial de actividad onchain
- auditoria interna de posiciones y eventos asociados

### 3.7 Campos derivados en memoria o base de datos

No hace falta pedirlos a la API si ya se pueden derivar:

- midpoint = `(bestBid + bestAsk) / 2`
- spread = `bestAsk - bestBid`
- precio historico agregado por ventana si ya se guarda el feed bruto

## 4. Esquemas Pydantic

Todos los esquemas de lectura deben usar `extra="ignore"` para descartar basura estructural sin romper la ingesta.

Ejemplo conceptual:

```python
from pydantic import BaseModel, ConfigDict


class PolymarketMarketSchema(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    condition_id: str
    slug: str
    title: str
    current_price: float | None = None
```

Esto permite validar solo lo que importa y tirar el resto sin trabajo manual.

## 5. Modelo de almacenamiento sugerido

Tablas minimas:

- `markets`
- `market_tokens`
- `price_ticks`
- `orderbook_snapshots`
- `trades`
- `holders`
- `wallet_activity`
- `sync_state`

### 5.1 Sync state

`sync_state` debe guardar al menos:

- feed name
- market or wallet target
- last processed timestamp
- last processed cursor u offset si aplica
- updated_at

## 6. Estrategia incremental por feed

### Gamma

- full refresh programado de catalogo activo
- upsert por `conditionId`
- limpieza de mercados cerrados solo en ventanas controladas

### CLOB prices

- batch por lotes de token IDs visibles
- cache corto para UI
- historicos por checkpoint

### CLOB book

- snapshot puntual por mercado visible
- guardar solo top niveles si la UI no necesita profundidad completa

### Data trades

- pull incremental por mercado y por wallet
- checkpoint por timestamp

### Data holders

- refresh menos frecuente
- tope fijo de 20

### Data activity

- pagination controlada
- limite estricto por wallet
- solo para explorer y auditoria

## 7. Regla de oro para reducir limpieza

Si un campo no alimenta una vista, una regla de negocio o una join clave, no se guarda.

Ejemplos de descarte:

- imagenes secundarias
- categorias profundamente anidadas
- datos visuales redundantes
- history demasiado granular cuando la ventana visible no lo requiere

## 8. Orden de implementacion

1. Definir modelos Pydantic con `extra="ignore"`.
2. Implementar sync de Gamma para catalogo activo.
3. Guardar mapeo `conditionId -> clobTokenIds`.
4. Implementar batch de precios con CLOB.
5. Implementar book y snapshots top levels.
6. Implementar historicos y checkpoints.
7. Implementar trades, holders y activity para el explorer.
8. Añadir tests de integracion para cada payload canonical.

## 9. Resumen ejecutivo

La API de Polymarket si tiene las opciones que necesitamos, pero no todas deben usarse de la misma forma. La estrategia correcta es:

- Gamma para descubrir y filtrar mercados.
- CLOB para precios, book e historicos.
- Data API para trades, holders y actividad.
- Checkpoints incrementales para no repetir trabajo.
- Pydantic con `extra="ignore"` para absorber ruido del JSON.

Con este enfoque, el market-syncer trabaja sobre datos limpios, minimos y trazables desde el primer ingestor.