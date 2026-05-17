# GSR Market Intelligence — Catálogo de Gráficas

> **Documento de extensión de `UI_DESIGN_BRIEF.md`.** Especifica cada gráfica que aparece en el producto: dónde va, qué muestra, qué tipo es, qué librería usar, qué datos entran en cada eje y cómo interactúa el usuario.
>
> **Quién debe usar este documento:**
> - Diseñador o IA generadora del frontend.
> - Persona del equipo que implemente los componentes en `frontend/components/charts/`.
> - Backend developer para saber **qué endpoints tienen que devolver** los datos que cada gráfica necesita.
>
> **Convención de IDs:** cada gráfica tiene un identificador `G##` para referenciarla desde el brief, desde el código (`PriceChart.tsx → G3`) y desde issues.

---

## Índice de gráficas

| ID | Nombre | Pantalla | Tipo | Librería |
|---|---|---|---|---|
| **G1** | KPI Sparkline | Dashboard, Ecosystem | Sparkline | Recharts |
| **G2** | Market Mini Chart (en tabla) | Markets list, Dashboard | Sparkline | Recharts |
| **G3** | Price History (Yes/No) | Market Detail ⭐ | Line chart multi-serie | Lightweight Charts |
| **G4** | Chainlink Overlay | Market Detail (opcional) | Line chart secundario | Lightweight Charts |
| **G5** | Volume Bars | Market Detail (debajo de G3) | Histogram bars | Lightweight Charts |
| **G6** | Orderbook Depth Chart | Market Detail / tab Orderbook | Step area chart | Recharts |
| **G7** | Top Holders Bar | Market Detail / panel lateral | Horizontal bar chart | Recharts |
| **G8** | Contract Activity | Contracts explorer | Line + area chart | Lightweight Charts |
| **G9** | Unique Wallets Daily | Contracts explorer | Bar chart | Recharts |
| **G10** | Resolution Timeline | Resolution Detail ⭐ | Custom horizontal timeline | SVG / D3 |
| **G11** | Bond Distribution | Resolutions list (opcional) | Histogram | Recharts |
| **G12** | Divergence Mini Chart | Signals cards | Dual line mini | Recharts |
| **G13** | Market vs Chainlink | Signals detail | Dual axis line | Lightweight Charts |
| **G14** | Ecosystem Volume | Ecosystem | Line + bar combo | Lightweight Charts |
| **G15** | Active Markets Over Time | Ecosystem | Line chart | Lightweight Charts |
| **G16** | Category Breakdown | Ecosystem | Horizontal bar | Recharts |
| **G17** | Calibration Scatter | Ecosystem ⭐ | Scatter + reference line | Recharts |
| **G18** | Activity Heatmap | Ecosystem (opcional) | Heatmap | D3 / Visx |

**⭐ = gráficas más importantes del producto, mayor inversión en pulido.**

---

## Convenciones aplicables a todas las gráficas

Antes del detalle por gráfica, reglas que aplican siempre:

**Colores (referenciados de `UI_DESIGN_BRIEF.md` sección 3.1):**
- Serie YES → `--success` (#22C55E)
- Serie NO → `--danger` (#EF4444)
- Serie Chainlink overlay → `--info` (#06B6D4)
- Serie principal genérica → `--accent` (#4F8CFF)
- Marcadores de eventos (noticias) → `--warning` (#F59E0B)
- Marcadores de propuestas oracle → morado #A855F7
- Grid lines → `--border-subtle` (#1F2433)
- Axis labels → `--text-secondary` (#8A92A6)
- Tooltip background → `--bg-elevated` (#1A1F2E)

**Tipografía en gráficas:**
- Ejes y labels → font-sans 11px regular
- Valores numéricos en tooltips → font-mono 12px medium
- Títulos (van fuera, en el Chart Container) → sans 14px semibold

**Interacciones comunes:**
- Tooltip al hover con timestamp + valores de cada serie.
- Crosshair vertical que sigue al cursor en gráficas de tiempo.
- Eje X de tiempo: formato relativo (ej: "2h ago") en periodos cortos, fechas en periodos largos.
- Sin animaciones de entrada superiores a 300ms (es una herramienta pro, no marketing).

**Responsividad:**
- En desktop, ancho del Chart Container.
- En tablet, altura reducida a 320px.
- En mobile, altura 240-280px, ejes con menos labels.

**Estados:**
- Loading: skeleton del área de la gráfica con shimmer.
- Empty: icono sutil centrado + "No data for this period".
- Error: icono rojo + "Failed to load data" + botón retry.

---

## G1 — KPI Sparkline

**Aparece en:** Dashboard (5 KPI Cards), Ecosystem (KPI strip).

**Propósito:** mostrar tendencia de los últimos 30 puntos del KPI principal del card.

**Tipo:** sparkline (mini línea sin ejes).

**Librería:** Recharts (`<LineChart>` minimalista) o SVG custom inline (más liviano).

**Dimensiones:** ancho 100% del card (~160-200px), altura 32-40px.

**Datos:**
- Eje X: índice 0..29 (no se muestra).
- Eje Y: valor del KPI (no se muestra).
- 1 sola serie, color `--accent` si delta positivo, `--danger` si negativo.

**Endpoint backend:**
```
GET /api/ecosystem/kpi/{key}/sparkline?points=30
→ { "values": [0.32, 0.35, ...30 floats...] }
```

**Interacciones:** ninguna. Solo decorativo informativo.

---

## G2 — Market Mini Chart (en tabla)

**Aparece en:** tabla de mercados en `/`, `/markets`.

**Propósito:** vistazo rápido de cómo se ha movido el precio del mercado en las últimas 24h, dentro de una celda de tabla.

**Tipo:** sparkline.

**Librería:** Recharts minimalista, o SVG inline.

**Dimensiones:** ~120×32px.

**Datos:**
- Eje X: ticks de tiempo de las últimas 24h.
- Eje Y: precio YES (0..1).
- 1 sola serie, color `--accent` por defecto, `--success` si delta 24h > 0, `--danger` si < 0.

**Endpoint backend:**
```
GET /api/markets/{id}/sparkline?window=24h
→ { "points": [{"t": 1715184000, "p": 0.42}, ...] }
```

**Interacciones:** none.

---

## G3 — Price History (Yes/No) ⭐

**Aparece en:** Market Detail (`/markets/[slug]`), pantalla principal del producto.

**Propósito:** mostrar evolución temporal del precio YES y NO del mercado, con marcadores de eventos importantes superpuestos.

**Tipo:** line chart multi-serie con marcadores.

**Librería:** **TradingView Lightweight Charts** (`createChart`, `addLineSeries`).

**Dimensiones:** ancho 100% del Chart Container, altura 400-480px.

**Datos:**
- Eje X: timestamp (con crosshair).
- Eje Y izquierdo: precio 0..1 (escala fija, 4 decimales).
- Serie 1 "Yes": color `--success`.
- Serie 2 "No": color `--danger`.
- (Opcional) Serie 3 "Chainlink": color `--info` (ver G4).

**Marcadores en la gráfica:**
- Noticias importantes → punto amarillo `--warning` en la línea, tooltip con título de noticia.
- Propuestas de resolución (oracle) → punto morado #A855F7, tooltip con bond y proposer.
- Disputas → punto rojo `--danger` con borde grueso.

**Toolbar (parte superior del Chart Container):**
- Intervalo: `[1H] [4H] [1D] [1W] [MAX]` (pill group).
- Toggle de series: `[Yes ●] [No ●] [Chainlink ●]` (click para mostrar/ocultar).
- Toggle de marcadores: `[News ●] [Oracle ●]`.

**Tooltip al hover:**
```
2026-05-11 14:32 UTC
Yes:        0.4231
No:         0.5769
Volume 1h:  $12,340
[Si hay evento cercano]
📰 Reuters: "Trump leads in Iowa polls"
```

**Endpoint backend:**
```
GET /api/markets/{id}/prices?interval=1h&from=...&to=...
→ {
    "interval": "1h",
    "series_yes": [{"t": ..., "v": 0.42}, ...],
    "series_no": [{"t": ..., "v": 0.58}, ...],
    "markers": [
      {"t": ..., "type": "news", "title": "...", "url": "..."},
      {"t": ..., "type": "oracle_proposal", "bond_usd": 750, "proposer": "0x..."}
    ]
  }
```

**Interacciones:**
- Zoom con rueda del ratón.
- Pan arrastrando con click izquierdo.
- Crosshair sigue al cursor.
- Click en marcador → modal con detalle del evento.

---

## G4 — Chainlink Overlay

**Aparece en:** dentro de G3, solo si el mercado tiene un activo financiero asociado (BTC, ETH, etc.).

**Propósito:** mostrar el precio "real" del activo en el tiempo, para comparar con la probabilidad implícita del mercado.

**Tipo:** line chart como serie adicional en G3, con **segundo eje Y a la derecha**.

**Librería:** Lightweight Charts (`priceScale` derecho).

**Datos:**
- Mismo eje X que G3.
- Eje Y derecho: precio en USD del activo (escala libre).
- Serie color `--info` (cyan), línea más fina (1.5px) y semitransparente (opacity 0.7) para no competir con Yes/No.

**Endpoint backend:** se devuelve dentro del response de G3 cuando aplica:
```
"chainlink_overlay": {
  "asset_pair": "BTC/USD",
  "feed_address": "0xc907...",
  "series": [{"t": ..., "v": 67234.50}, ...]
}
```

**Interacciones:** toggle en la leyenda de G3.

---

## G5 — Volume Bars

**Aparece en:** Market Detail, debajo de G3, compartiendo eje X.

**Propósito:** mostrar el volumen de trading en USD por intervalo, sincronizado temporalmente con la gráfica de precio.

**Tipo:** histogram (barras verticales).

**Librería:** Lightweight Charts (`addHistogramSeries`).

**Dimensiones:** ancho 100%, altura 80-100px (pequeña debajo de G3).

**Datos:**
- Eje X: mismo que G3 (mismos timestamps).
- Eje Y: volumen en USD.
- Color de barras: `--success` con opacity 0.4 si el precio Yes cerró arriba en ese intervalo, `--danger` con opacity 0.4 si bajó. Si flat, `--text-secondary`.

**Endpoint backend:** se devuelve junto con G3:
```
"volume_series": [{"t": ..., "v": 12340.0, "direction": "up"}, ...]
```

**Interacciones:** crosshair sincronizado con G3, tooltip muestra el volumen del intervalo bajo el cursor.

---

## G6 — Orderbook Depth Chart

**Aparece en:** Market Detail, tab "Orderbook".

**Propósito:** visualizar la profundidad del orderbook (cuánto volumen acumulado hay a cada precio).

**Tipo:** step area chart de dos lados (bids verdes a la izquierda, asks rojos a la derecha).

**Librería:** Recharts (`AreaChart` con `step` interpolation).

**Dimensiones:** ancho 100%, altura 240-320px.

**Datos:**
- Eje X: precio (de 0 a 1, centrado en el midpoint).
- Eje Y: tamaño acumulado en shares.
- Serie izquierda "Bids": área `--success` semitransparente.
- Serie derecha "Asks": área `--danger` semitransparente.
- Línea vertical punteada en el midpoint, label "Midpoint: 0.42".

**Endpoint backend:**
```
GET /api/markets/{id}/orderbook
→ {
    "bids": [{"price": 0.41, "cumulative_size": 1500}, ...],
    "asks": [{"price": 0.43, "cumulative_size": 2300}, ...],
    "midpoint": 0.42
  }
```

**Interacciones:** tooltip al hover con precio exacto y tamaño acumulado a ese nivel.

---

## G7 — Top Holders Bar

**Aparece en:** Market Detail, panel lateral derecho (versión mini) y tab "Holders" (versión completa).

**Propósito:** ranking visual de las 5-50 wallets con más posiciones.

**Tipo:** horizontal bar chart.

**Librería:** Recharts (`BarChart` con `layout="vertical"`).

**Datos:**
- Eje Y: address truncada (componente `AddressPill`).
- Eje X: valor en USD de la posición.
- Color de barra: `--success` si la posición es YES, `--danger` si es NO.
- Barras ordenadas descendente.

**Endpoint backend:**
```
GET /api/markets/{id}/holders?limit=50
→ {
    "holders": [
      {"address": "0x...", "shares": 12000, "side": "yes", "value_usd": 5040, "pnl_usd": 230},
      ...
    ]
  }
```

**Interacciones:** click en barra → ir a `/contracts/{address}` (vista wallet en el futuro).

---

## G8 — Contract Activity

**Aparece en:** `/contracts/[address]` (explorador on-chain).

**Propósito:** mostrar evolución de actividad (número de transacciones) en el contrato a lo largo del tiempo.

**Tipo:** line chart con área debajo.

**Librería:** Lightweight Charts (`addAreaSeries`).

**Dimensiones:** ancho 100%, altura 320px.

**Datos:**
- Eje X: tiempo (configurable: hora, día, semana).
- Eje Y: número de transacciones por bucket.
- Serie principal color `--accent` con área gradiente del mismo color al transparente.

**Toolbar:** intervalo `[1H] [1D] [1W] [1M] [MAX]`.

**Endpoint backend:**
```
GET /api/contracts/{address}/activity?interval=1d
→ {
    "interval": "1d",
    "buckets": [
      {"t": ..., "tx_count": 234, "unique_senders": 89, "volume_usd": 45000},
      ...
    ]
  }
```

**Interacciones:** tooltip muestra los tres valores del bucket (tx count, unique wallets, volume).

---

## G9 — Unique Wallets Daily

**Aparece en:** `/contracts/[address]`, debajo de G8 o al lado.

**Propósito:** wallets únicas que interactuaron con el contrato cada día.

**Tipo:** bar chart vertical.

**Librería:** Recharts.

**Dimensiones:** ancho 100%, altura 200px.

**Datos:**
- Eje X: día.
- Eje Y: número de wallets únicas.
- Barras color `--info`.

**Endpoint backend:** mismos datos que G8 (campo `unique_senders`).

**Interacciones:** tooltip simple con fecha y count.

---

## G10 — Resolution Timeline ⭐

**Aparece en:** Resolution Detail (`/resolutions/[questionId]`). **Es la gráfica más distintiva del producto.**

**Propósito:** visualizar el ciclo completo de resolución de UMA Oracle como una línea temporal con hitos.

**Tipo:** **custom horizontal timeline** (no es una gráfica de datos estándar).

**Librería:** SVG nativo en React, o D3 si se complica. NO Lightweight Charts (no encaja).

**Dimensiones:** ancho 100%, altura 200-280px.

**Estructura visual:**

```
[Created] ────● Proposed ──────● Challenge ──────○ DVM Vote ──────○ Resolved
Mar 1         Mar 1+0h          Mar 1+2h          if disputed       outcome

  │             │                  │                  │                │
  │             ▼                  ▼                  ▼                ▼
  │           Proposer:       Window ends in     Voters: 234
  │           0x7a3...        14m 23s            For: 89%
  │           Bond: $750
  │           Outcome: YES
```

- Línea horizontal central con nodos (círculos rellenos cuando ya ocurrió, vacíos cuando aún no).
- Cada nodo tiene un label arriba (nombre de la fase) y debajo (timestamp).
- Debajo de cada nodo, una "tarjeta" expandible con detalles.
- Si hay disputa, el nodo "Challenge" cambia a color `--warning` con borde grueso pulsante.
- Colores por estado de nodo:
  - Completado correctamente → `--success`
  - Pendiente → `--text-secondary`
  - En curso (challenge window activa) → `--info`
  - Disputado → `--warning`
  - Resuelto controvertidamente → `--danger`

**Endpoint backend:**
```
GET /api/resolutions/{questionId}
→ {
    "question_id": "0x...",
    "current_phase": "challenge",  // initialized | proposed | challenge | disputed | dvm_vote | resolved
    "timeline": [
      {"phase": "initialized", "timestamp": ..., "completed": true, "data": {...}},
      {"phase": "proposed", "timestamp": ..., "completed": true, "data": {"proposer": "0x...", "bond_usd": 750, "outcome": "Yes"}},
      {"phase": "challenge", "timestamp": ..., "completed": false, "data": {"deadline": ..., "seconds_remaining": 863}},
      ...
    ]
  }
```

**Interacciones:**
- Click en un nodo → expande/colapsa la tarjeta de detalle debajo.
- Hover sobre un nodo → resalta y muestra resumen en tooltip.
- Si hay disputa, link "View on UMA Oracle Portal" abre `oracle.uma.xyz` en nueva tab.

**Nota técnica:** este componente probablemente quiera ser su propio componente React `ResolutionTimeline.tsx`, no parte del Chart Container genérico.

---

## G11 — Bond Distribution

**Aparece en:** `/resolutions` (opcional, header de la página).

**Propósito:** distribución de tamaños de bond depositados en las resoluciones recientes, para detectar outliers.

**Tipo:** histogram.

**Librería:** Recharts.

**Dimensiones:** ancho 100%, altura 160px (banner pequeño).

**Datos:**
- Eje X: rangos de bond en USD (buckets: <$100, $100-500, $500-1k, $1k-5k, >$5k).
- Eje Y: número de resoluciones en cada rango.
- Color `--accent`.

**Endpoint backend:**
```
GET /api/resolutions/stats?window=30d
→ { "bond_histogram": [{"bucket": "100-500", "count": 23}, ...] }
```

**Interacciones:** opcional, click filtra la tabla principal por ese rango.

---

## G12 — Divergence Mini Chart

**Aparece en:** cards de divergencia en `/signals`.

**Propósito:** mostrar las dos series (mercado vs señal externa) en miniatura para previsualizar la divergencia.

**Tipo:** dual line chart pequeño.

**Librería:** Recharts (`LineChart` minimalista).

**Dimensiones:** ancho 100% de la card (~480px), altura 80-100px.

**Datos:**
- Eje X: tiempo (últimas 24h).
- Eje Y: normalizado 0..1 para que ambas series se comparen visualmente.
- Serie 1 "Market": color `--accent`.
- Serie 2 "External signal": color `--info`.
- Área entre las dos líneas sombreada en `--warning` con opacity 0.2 (visualiza la divergencia).

**Endpoint backend:** se devuelve con la card:
```
"mini_chart_data": {
  "market_series": [{"t": ..., "v": 0.32}, ...],
  "external_series": [{"t": ..., "v": 0.45}, ...]
}
```

**Interacciones:** click en la card lleva a G13 (vista detalle).

---

## G13 — Market vs Chainlink (detalle)

**Aparece en:** `/signals/{divergenceId}` (vista detalle de una divergencia) y dentro del tab "Signals" del Market Detail.

**Propósito:** comparar precio implícito del mercado con valor real del oráculo Chainlink en alta resolución temporal.

**Tipo:** line chart de doble eje (dual axis).

**Librería:** Lightweight Charts (con dos `priceScale`).

**Dimensiones:** ancho 100% del Chart Container, altura 360-400px.

**Datos:**
- Eje X: timestamp.
- Eje Y izquierdo: precio implícito 0..1 del mercado.
- Eje Y derecho: precio en USD del activo Chainlink.
- Serie 1 "Market implied probability": color `--accent`.
- Serie 2 "Chainlink price": color `--info`.
- Marcador vertical donde se detectó la divergencia, línea punteada `--warning`.

**Endpoint backend:**
```
GET /api/signals/{id}
→ {
    "divergence": {...},
    "market_series": [...],
    "chainlink_series": [...],
    "detection_point": {"t": ..., "magnitude_pct": 12.3}
  }
```

**Interacciones:** zoom y pan como G3.

---

## G14 — Ecosystem Volume

**Aparece en:** `/ecosystem`, sección Volume & Activity.

**Propósito:** volumen total del ecosistema Polymarket en el tiempo.

**Tipo:** line + bar combo (línea para volumen total, barras para nuevos mercados creados).

**Librería:** Lightweight Charts (combinar `addLineSeries` + `addHistogramSeries`).

**Dimensiones:** ancho 50% del row (compartido con G15), altura 320px.

**Datos:**
- Eje X: tiempo (días o semanas).
- Eje Y izquierdo: volumen USD acumulado por día.
- Eje Y derecho: número de nuevos mercados ese día.
- Línea color `--accent`, barras color `--info` opacity 0.5.

**Toolbar:** intervalo `[1D] [1W] [1M] [3M] [1Y] [ALL]`.

**Endpoint backend:**
```
GET /api/ecosystem/volume?interval=1d
→ {
    "interval": "1d",
    "buckets": [
      {"t": ..., "volume_usd": 1234000, "new_markets": 12},
      ...
    ]
  }
```

---

## G15 — Active Markets Over Time

**Aparece en:** `/ecosystem`, al lado de G14.

**Propósito:** evolución del número de mercados activos en el ecosistema.

**Tipo:** line chart simple con área.

**Librería:** Lightweight Charts (`addAreaSeries`).

**Datos:**
- Eje X: tiempo (mismo que G14).
- Eje Y: count de mercados activos.
- Serie color `--accent`.

**Endpoint backend:**
```
GET /api/ecosystem/active-markets?interval=1d
→ { "buckets": [{"t": ..., "active_count": 1234}, ...] }
```

---

## G16 — Category Breakdown

**Aparece en:** `/ecosystem`, sección Categories.

**Propósito:** desglose de volumen por categoría de mercado en los últimos 30 días.

**Tipo:** horizontal bar chart.

**Librería:** Recharts.

**Dimensiones:** ancho 100%, altura ~360px (depende del número de categorías).

**Datos:**
- Eje Y: nombre de categoría (Politics, Sports, Crypto, Economics, etc.).
- Eje X: volumen USD.
- Color de barras: degradado del color del tag de la categoría (configurar paleta de categorías en el design system).
- Etiqueta a la derecha de cada barra con el valor exacto y porcentaje del total.

**Endpoint backend:**
```
GET /api/ecosystem/by-category?window=30d
→ {
    "total_volume_usd": 45_000_000,
    "categories": [
      {"name": "Politics", "volume_usd": 18_000_000, "share_pct": 40, "color": "#A855F7"},
      ...
    ]
  }
```

**Interacciones:** click en barra filtra `/markets` por esa categoría.

---

## G17 — Calibration Scatter ⭐

**Aparece en:** `/ecosystem`, sección Calibration. **Gráfica de alto valor científico/diferenciador.**

**Propósito:** medir cuán bien calibrados están los mercados de Polymarket. Cada punto es un mercado resuelto: eje X es la probabilidad implícita media del mercado, eje Y es el resultado real (1 si SÍ, 0 si NO).

**Tipo:** scatter plot con línea de referencia diagonal.

**Librería:** Recharts (`ScatterChart`).

**Dimensiones:** ancho 100%, altura 480px.

**Datos:**
- Eje X: probabilidad implícita media del mercado (0..1).
- Eje Y: outcome final (0 o 1, con jitter pequeño para que no se solapen).
- Cada punto: un mercado resuelto. Color por categoría (mismo mapeo que G16). Tamaño proporcional al volumen del mercado (`size = log(volume)`).
- **Línea diagonal de referencia** (0,0) → (1,1) → "Perfect calibration".
- **Líneas horizontales agregadas:** para cada bucket del eje X (0-10%, 10-20%, ..., 90-100%), mostrar la tasa real de aciertos como puntos grandes amarillos.

**Toolbar:**
- Filtros: `[All categories] [Politics] [Crypto] [Sports] ...` (chips).
- Toggle: `[Show individual markets ●] [Show aggregated buckets ●]`.
- Window: `[Last 90d] [Last 1y] [All time]`.

**Endpoint backend:**
```
GET /api/ecosystem/calibration?window=all&category=all
→ {
    "markets": [
      {"id": "...", "implied_prob_avg": 0.65, "outcome": 1, "category": "politics", "volume_usd": 24000},
      ...
    ],
    "buckets": [
      {"range": "0-10%", "predicted_avg": 0.05, "actual_rate": 0.04, "count": 234},
      ...
    ]
  }
```

**Interacciones:**
- Hover sobre punto → tooltip con question, predicted, actual, category.
- Click sobre punto → navega a `/markets/{slug}`.

---

## G18 — Activity Heatmap (opcional)

**Aparece en:** `/ecosystem` (sección opcional si hay tiempo).

**Propósito:** mostrar a qué horas del día y días de la semana hay más actividad de trading.

**Tipo:** heatmap (rejilla 7×24).

**Librería:** D3 o Visx (componente custom, Recharts no tiene heatmap nativo bueno).

**Dimensiones:** ancho 100%, altura 200px.

**Datos:**
- Eje X: hora del día (0-23).
- Eje Y: día de la semana (Lun-Dom).
- Color de cada celda: intensidad según volumen de trades en esa franja.
- Escala de color: secuencial del `--bg-card` (frío) a `--accent` (cálido).

**Endpoint backend:**
```
GET /api/ecosystem/activity-heatmap?window=30d
→ {
    "matrix": [
      [{"hour": 0, "day": 0, "tx_count": 234}, ...],
      ...
    ]
  }
```

**Interacciones:** tooltip al hover con el valor exacto.

**Nota:** marcada como opcional porque es valor añadido pero requiere más curro custom. Implementar en Sprint 7 solo si las críticas (G3, G10, G17) ya están bien.

---

## Resumen para el backend

Endpoints que tienen que existir para alimentar todas las gráficas:

```
# Mercados
GET /api/markets/{id}/sparkline                       → G2
GET /api/markets/{id}/prices                          → G3, G4, G5
GET /api/markets/{id}/orderbook                       → G6
GET /api/markets/{id}/holders                         → G7

# Contratos
GET /api/contracts/{address}/activity                 → G8, G9

# Resoluciones
GET /api/resolutions/{questionId}                     → G10
GET /api/resolutions/stats                            → G11

# Señales y divergencias
GET /api/signals/{id}                                 → G12, G13

# Ecosystem
GET /api/ecosystem/kpi/{key}/sparkline                → G1
GET /api/ecosystem/volume                             → G14
GET /api/ecosystem/active-markets                     → G15
GET /api/ecosystem/by-category                        → G16
GET /api/ecosystem/calibration                        → G17
GET /api/ecosystem/activity-heatmap                   → G18
```

---

## Prioridades de implementación

Si el tiempo aprieta en Sprint 7 (frontend), implementar en este orden:

**Tier 1 (críticas, sin estas no hay demo):**
- G1 (sparklines de KPI)
- G3 (Price History en Market Detail)
- G10 (Resolution Timeline)
- G17 (Calibration Scatter)

**Tier 2 (importantes, complementan):**
- G2, G5, G7, G8, G14

**Tier 3 (nice to have):**
- G4, G6, G9, G11, G12, G13, G15, G16

**Tier 4 (opcional):**
- G18

Con Tier 1 + Tier 2 completos, ya hay una demo sólida y diferenciada para GSR.

---

## Notas finales

- **Lightweight Charts vs Recharts:** la regla simple es "series temporales largas con interactividad pro (zoom, pan, crosshair) → Lightweight Charts. Todo lo demás → Recharts". D3 solo donde ninguno encaja (timeline custom G10, heatmap G18).
- **Mock data realista:** cada gráfica debe poder verse en desarrollo con datos mockeados que parezcan reales. El frontend deve poder funcionar sin backend en local con fixtures en `frontend/lib/mocks/`.
- **No reinventar el wheel:** todas las gráficas usan el `Chart Container` del brief sección 6.3 como envoltorio común (título, toolbar, footer de stats). Solo cambia lo que va dentro.
- **Performance:** para mercados con más de 5000 puntos, hacer downsampling en el backend antes de enviar. Lightweight Charts aguanta 100k puntos sin problema, pero el backend no debe transferir 5MB de JSON innecesariamente.
