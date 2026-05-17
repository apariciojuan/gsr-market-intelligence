# GSR Market Intelligence — Brief de diseño UI/UX

> Documento de especificación visual y de experiencia para diseñar e implementar la interfaz web. Pensado para ser usado directamente por una IA generadora de diseño (v0, Lovable, Bolt, etc.) o por un diseñador humano.

---

## 1. Contexto del producto

**Producto:** plataforma web profesional de análisis y vigilancia de prediction markets (Polymarket).

**Usuario objetivo:** analistas financieros, traders cuantitativos, investigadores y profesionales de market making. NO es un público consumidor casual.

**Lo que el producto debe transmitir:**
- Rigor técnico y confianza.
- Densidad de información (no minimalismo extremo).
- Estética financiera/cuantitativa (terminal pro, no app social).
- Las gráficas son el centro: la mayoría de pantallas tienen una o más gráficas como elemento dominante.

**Lo que el producto NO debe parecer:**
- Una app de apuestas o casino.
- Una landing page de marketing.
- Una herramienta consumer estilo Robinhood.

---

## 2. Referencias visuales

Inspiración directa (pedir al modelo que estudie estas estéticas):

| Producto | Aporta |
|---|---|
| **Dune Analytics** (dune.com) | Densidad de info, dashboards de datos blockchain, tablas con gráficas embebidas. |
| **Etherscan** (etherscan.io) | Direcciones truncadas con copy button, tabs informativos, presentación de transacciones. |
| **TradingView** (tradingview.com) | Gráficas profesionales de series temporales, controles de intervalo, overlays. |
| **Nansen** (nansen.ai) | Analytics de wallets, "smart money" tracking, badges informativos. |
| **Linear** (linear.app) | UI dark sobria, jerarquía clara, monospace donde toca, microinteracciones sutiles. |

**Tomar de cada uno:**
- De Dune: cómo combinar tablas y mini-gráficas en la misma vista.
- De Etherscan: cómo presentar datos densos sin saturar.
- De TradingView: cómo se ven las gráficas grandes con controles.
- De Nansen: cómo etiquetar wallets y marcar entidades.
- De Linear: la sobriedad del look general y la calidad de las microinteracciones.

---

## 3. Design tokens

### 3.1 Colores (dark mode por defecto)

```css
/* Backgrounds */
--bg-base:        #0B0E14;   /* fondo de página */
--bg-card:        #141821;   /* fondo de cards */
--bg-card-hover:  #1C2030;   /* hover de cards y filas */
--bg-elevated:    #1A1F2E;   /* modales, dropdowns */

/* Borders */
--border-subtle:  #1F2433;
--border-default: #262B3A;
--border-strong:  #353B4D;

/* Text */
--text-primary:   #E6E9F0;   /* texto principal */
--text-secondary: #8A92A6;   /* labels, metadatos */
--text-muted:     #5A6178;   /* placeholders, disabled */
--text-inverse:   #0B0E14;   /* texto sobre accent */

/* Accent / Brand */
--accent:         #4F8CFF;   /* CTAs principales, links */
--accent-hover:   #6BA0FF;
--accent-subtle:  #1E2B47;   /* fondos de elementos accent */

/* Semantic */
--success:        #22C55E;   /* alza, positivo, resuelto correctamente */
--success-bg:     #0E2818;
--danger:         #EF4444;   /* baja, negativo, error */
--danger-bg:      #2A1212;
--warning:        #F59E0B;   /* disputa, pendiente, atención */
--warning-bg:     #2A1F08;
--info:           #06B6D4;   /* neutral informativo */
--info-bg:        #082A30;
```

### 3.2 Tipografía

```css
--font-sans:  "Inter", "Geist", system-ui, sans-serif;
--font-mono:  "JetBrains Mono", "Geist Mono", "SF Mono", monospace;

/* Sizes */
--text-xs:   11px;   /* badges, metadatos micro */
--text-sm:   12px;   /* tablas densas, labels */
--text-base: 14px;   /* base UI */
--text-md:   16px;   /* énfasis suave */
--text-lg:   18px;   /* títulos de card */
--text-xl:   22px;   /* títulos de sección */
--text-2xl:  28px;   /* KPIs grandes */
--text-3xl:  36px;   /* solo en pantalla principal */

/* Weights */
--weight-regular:  400;
--weight-medium:   500;
--weight-semibold: 600;
```

**Reglas de uso:**
- **Texto narrativo, labels, descripciones:** sans-serif.
- **Cualquier número (precio, volumen, %, address, hash, count):** monospace siempre.
- **Títulos:** sans-serif semibold.

### 3.3 Espaciado y radios

```css
/* Spacing scale (4px base) */
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* Border radius */
--radius-sm:  4px;   /* pills, badges */
--radius-md:  6px;   /* botones, inputs */
--radius-lg:  8px;   /* cards */
--radius-xl:  12px;  /* modales */
```

### 3.4 Elevación

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
--shadow-md: 0 4px 8px rgba(0, 0, 0, 0.5);
--shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.6);
```

---

## 4. Layout global

### 4.1 Estructura general

```
┌──────────────────────────────────────────────────────────┐
│  TOP BAR (56px, sticky)                                  │
│  [Logo] [SearchBar global ........ ] [Notif] [UserMenu]  │
├──────┬───────────────────────────────────────────────────┤
│      │                                                   │
│ SIDE │              MAIN CONTENT                         │
│ BAR  │              (max-width 1440px)                   │
│ 64px │                                                   │
│      │                                                   │
│ icon │                                                   │
│ only │                                                   │
│      │                                                   │
└──────┴───────────────────────────────────────────────────┘
```

- **Top bar:** 56px de altura, fondo `--bg-card`, border-bottom sutil. Sticky.
- **Sidebar:** 64px de ancho colapsada (solo iconos), expandible a 220px al hacer hover. Fondo `--bg-card`.
- **Main content:** padding lateral de 24px, max-width 1440px centrado.
- **Mobile:** sidebar se convierte en bottom navigation con 4-5 iconos principales.

### 4.2 Navegación en sidebar

Iconos verticales con tooltip al hover (colapsada) o label visible (expandida):

1. 🏠 Dashboard → `/`
2. 📈 Markets → `/markets`
3. ⚖️ Resolutions → `/resolutions`
4. 🔀 Signals → `/signals`
5. 🌐 Ecosystem → `/ecosystem`
6. 🔍 Explorer → `/contracts` (input directo de address)
7. ⚙️ Settings → `/settings` (al fondo, separado por divider)

Nota: estos emojis son solo para ilustrar la posición. **En el UI real usar iconos de Lucide React** (mismo set que shadcn/ui usa).

---

## 5. Sitemap completo

```
/login                              Login
/                                   Dashboard principal
/markets                            Listado de mercados con filtros
/markets/[slug]                     Detalle de mercado ⭐
/contracts                          Buscador de address
/contracts/[address]                Explorador on-chain por address
/resolutions                        Resolution Watchdog (tabla)
/resolutions/[questionId]           Detalle de un ciclo de resolución
/signals                            Divergencias y señales externas
/ecosystem                          Métricas agregadas
/settings                           Perfil y preferencias
```

---

## 6. Componentes reutilizables

Estos son los building blocks que aparecen en múltiples pantallas. Diseñarlos bien una vez y reutilizar.

### 6.1 KPI Card

```
┌─────────────────────────────────┐
│ LABEL EN CAJA pequeña gris      │  ← --text-secondary, 11px, uppercase
│                                 │
│ $8.6B            ↗ +12.3%       │  ← número grande mono, delta colored
│                                 │
│ [sparkline de 30 puntos]        │  ← mini gráfica sin ejes, color accent
└─────────────────────────────────┘
```

Variantes:
- Con delta positivo (verde) / negativo (rojo) / neutro (gris).
- Con/sin sparkline.
- Tamaño normal (160-200px ancho) o ancho (300-400px ancho).

### 6.2 Data Table

Tabla densa estilo Etherscan/Dune:

- Header sticky con `--bg-card-hover`.
- Filas con border-bottom `--border-subtle`, hover `--bg-card-hover`.
- Padding vertical 10-12px (densidad media-alta).
- Columnas con tipo mixto: texto normal (sans), números (mono), badges, mini-charts.
- Sorting por columna con flecha animada.
- Paginación al pie (10/25/50/100 por página) + total count.
- Soporta selección múltiple con checkboxes (futuro).
- Loading state con skeleton rows.
- Empty state con mensaje claro + CTA si aplica.

### 6.3 Chart Container

Contenedor estándar para todas las gráficas grandes:

```
┌──────────────────────────────────────────────────────────┐
│ Título de la gráfica          [1H] [4H] [1D] [1W] [MAX] │  ← intervalo
│ Subtítulo / metadata          [Yes ●] [No ●] [Chainlink]│  ← series toggleables
├──────────────────────────────────────────────────────────┤
│                                                          │
│              [LA GRÁFICA — TradingView LWC]              │
│                                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Min: 0.34   Max: 0.78   Avg: 0.61   Vol 24h: $2.4M     │  ← stats footer
└──────────────────────────────────────────────────────────┘
```

- Altura por defecto: 400-480px.
- Toolbar arriba a la derecha con intervalos clicables (pill group).
- Leyenda inline con toggle (click para ocultar/mostrar serie).
- Footer opcional con stats agregados.
- Fullscreen toggle en esquina (icono).

### 6.4 Status Pill

Pequeñas etiquetas de estado:

```
●  Active        (azul, --info)
●  Resolved      (verde, --success)
●  Disputed      (ámbar, --warning)
●  Closed        (gris, --text-secondary)
●  Pending UMA   (ámbar pulsante)
```

Formato: 24px de altura, padding horizontal 10px, radius `--radius-sm`, fuente 11px medium uppercase. Punto coloreado a la izquierda.

### 6.5 Address Pill

Para mostrar direcciones de wallets/contratos:

```
┌────────────────────────────┐
│ 0x7a3f...8b21 [📋] [↗]    │   ← truncado, copy, link a Polygonscan
└────────────────────────────┘
```

- Fuente monospace.
- Si la wallet tiene label conocida (ej: "Polymarket Treasury"), mostrar el label en vez de la address con un tooltip que muestre la address completa.
- Icono copy con feedback de "copiado" al click.
- Icono external link → Polygonscan en nueva tab.

### 6.6 Tab Bar

```
┌─────────────────────────────────────────────────────────────┐
│ [Trades] [Orderbook] [Holders] [Resolution] [Signals]      │
│ ━━━━━━━                                                     │  ← underline activo
└─────────────────────────────────────────────────────────────┘
```

- Activa: texto `--text-primary` + underline `--accent`.
- Inactiva: texto `--text-secondary`.
- Hover: texto `--text-primary`.

### 6.7 Global Search

Buscador global en la top bar. Estilo "command palette":

- Input ancho ~480px.
- Placeholder: "Buscar mercado, address, wallet o tag..."
- Atajo de teclado mostrado: `⌘ K` (badge a la derecha del input).
- Al hacer focus, abre un dropdown con resultados agrupados:
  - **Markets** (3 resultados)
  - **Wallets** (3 resultados)
  - **Contracts** (3 resultados)
  - **Tags** (3 resultados)
- Resultados navegables con flechas + Enter.

### 6.8 Empty States y Loading

- **Empty state:** icono grande sutil + título + descripción breve + CTA opcional. Centrado vertical y horizontal en el contenedor.
- **Loading:** skeleton screens (rectángulos animados con shimmer), nunca spinners centrados, salvo en operaciones modales muy puntuales.

---

## 7. Pantallas detalladas

### 7.1 `/login` — Login

Layout: pantalla completa centrada. Card de ~400px de ancho, fondo `--bg-card`, padding 32px.

Contenido:
- Logo del producto arriba.
- Título: "GSR Market Intelligence".
- Subtítulo: "Sign in to your account".
- Campo email (label arriba, input full width).
- Campo password con icono show/hide.
- Botón principal "Sign in" (full width, accent).
- Footer pequeño: "Contact your admin for access" (sin link de registro abierto, ya que solo 4-5 usuarios).

Notas:
- Background con un patrón sutil o gradiente muy oscuro para que no sea negro plano.
- Si hay error de auth, banner rojo arriba del card.

### 7.2 `/` — Dashboard principal

Layout: scroll vertical, contenido organizado en grid de 12 columnas.

**Sección 1 — KPI Strip (full width):**

Grid de 5 KPI Cards, cada una ocupando 2.4 columnas:

```
[Volumen 24h] [Mercados activos] [Resoluciones pendientes] [Divergencias hoy] [Usuarios activos 24h]
```

Cada KPI Card sigue el componente 6.1.

**Sección 2 — Mercados destacados (8 columnas):**

Card con título "Top Markets — Last 24h" y Data Table con 10 filas:

| Columna | Tipo | Notas |
|---|---|---|
| Question | texto | Truncar a 1 línea con ellipsis. Click → detalle. |
| Category | pill | Color por categoría. |
| Price YES | mono | Formato `$0.42`. |
| Δ 24h | mono colored | Verde/rojo según delta. |
| Volume 24h | mono | Formato `$2.4M`. |
| Mini chart | sparkline | 30 puntos, color accent. |
| End date | texto small | "in 12d" o fecha. |

**Sección 3 — Resolution Watchdog teaser (4 columnas):**

Card con título "Active Resolutions" + lista de 4-5 items:

```
┌─────────────────────────────────────┐
│ Active Resolutions          [View all] │
├─────────────────────────────────────┤
│ ● Disputed                          │
│ Will Trump win 2028?                │
│ Bond: $750  |  Ends in 1h 23m       │
├─────────────────────────────────────┤
│ ● Pending UMA                       │
│ Bitcoin > $200k EOY 2026?           │
│ Bond: $750  |  Ends in 4h           │
├─────────────────────────────────────┤
│  ...                                │
└─────────────────────────────────────┘
```

**Sección 4 — Divergencias destacadas (12 columnas):**

Card con título "Notable Divergences — Last 24h". Grid 3 columnas con 3 cards, cada una mostrando:
- Mercado afectado (truncado).
- Tipo de divergencia (badge: "Price gap", "News not reflected", "Sudden move").
- Magnitud y dirección.
- Mini-gráfica con dos series superpuestas mostrando la divergencia.
- Botón "Investigate" → `/signals`.

### 7.3 `/markets` — Listado de mercados

Layout: filtros arriba + tabla full width.

**Filtros:**
- Chips horizontales: All / Politics / Sports / Crypto / Economics / Other.
- Toggle: Active / Resolved / All.
- Dropdown: Sort by → Volume / Liquidity / End date / Recently created.
- Search input local (filtra la tabla actual).

**Tabla:**
Igual que la tabla del dashboard pero con más columnas: Liquidity, Holders count, Created date. Paginación 50 por página.

### 7.4 `/markets/[slug]` — Detalle de mercado ⭐ (la más importante)

Layout: dos columnas. Izquierda 8 cols (contenido principal), derecha 4 cols (panel lateral).

**Columna izquierda:**

**Header:**
```
[ ← Back to markets ]

Will Trump win the 2028 Presidential Election?     [● Active] [⭐ Watch]

Politics  •  Ends Nov 3, 2028  •  Vol: $24.3M  •  Liquidity: $1.2M
```

**Gráfica grande (Chart Container, componente 6.3):**
Título: "Price History"
Series: Yes (azul), No (rojo), Chainlink overlay (cyan, si aplica).
Intervalos: 1H, 4H, 1D, 1W, MAX.
Marcadores en la gráfica: noticias importantes (puntos amarillos), propuestas de resolución (puntos morados).
Tooltip al hover muestra: timestamp exacto, precio yes/no, eventos cercanos.

**Tabs (componente 6.6):**

1. **Trades** — Data Table con: timestamp, side, price, size, wallet (address pill), tx hash.
2. **Orderbook** — Vista de orderbook con bids/asks en columnas, depth chart al pie.
3. **Holders** — Data Table top 50 wallets con: rank, address pill, shares, side (yes/no), avg buy price, current value, PnL estimado.
4. **Resolution** — Card con reglas de resolución (texto), timeline visual del oracle, histórico de propuestas si las hubo.
5. **Signals** — Lista timeline de noticias relevantes + comparación con Chainlink si aplica + métricas de divergencia.

**Columna derecha (panel lateral, sticky):**

Cards apiladas verticalmente:

1. **Stats card:** Volume 24h/7d/total, Liquidity, Open Interest, Trader count.
2. **Resolution Rules card:** texto con las reglas oficiales (de Polymarket). Botón "View in UMA" → portal de UMA.
3. **Linked Contracts card:**
   - Market address (Address Pill)
   - Condition ID (mono truncado con copy)
   - Token IDs Yes/No (mono truncados con copy)
   - Link "View on Polygonscan"
4. **Top Holders mini:** top 5 wallets con barra horizontal proporcional a holdings.

### 7.5 `/contracts/[address]` — Explorador on-chain

Header con address grande + tipo detectado (badge: "Polymarket Market", "ERC-20", "Unknown"):

```
0xE111180000d2663C0091e4f400237545B87B996B [📋] [↗]
[● Polymarket CTF Exchange]

Name: CTF Exchange
First seen: 2021-06-15
Total transactions: 4,832,109
Unique wallets: 142,847
```

Si el contrato corresponde a un mercado conocido → CTA grande arriba:

```
┌──────────────────────────────────────────────┐
│ ✨ This contract is linked to a market       │
│ "Will Trump win the 2028 Election?"          │
│                                [View market] │
└──────────────────────────────────────────────┘
```

Sección de gráficas:
- **Activity over time** (Chart Container): número de txs por hora/día.
- **Volume over time**: USD volume si aplica.
- **Unique wallets per day**.

Tabla paginada con todas las transacciones decodificadas: timestamp, event name, from, to, args (JSON colapsable), tx hash.

### 7.6 `/resolutions` — Resolution Watchdog (la más diferenciadora)

Layout: filtros arriba + tabla principal.

**Filtros:**
- Chips: All / Pending / Proposed / Disputed / Resolved (last 7d).
- Dropdown: Sort by → End time / Bond size / Dispute heat.
- Search: por question text.

**Tabla:**

| Columna | Notas |
|---|---|
| Status | Status Pill grande (Pending UMA / Proposed / Disputed / Resolved). |
| Question | Truncado. Click → detalle. |
| Bond | mono USDC. |
| Proposer | Address Pill. |
| Disputer | Address Pill o "—" si no hay disputa. |
| Challenge window | Countdown live ("2h 14m") o ✓ Passed. |
| End date | timestamp. |
| Actions | Botón "View on UMA" → external. |

**Filas resaltadas:**
- Si está "Disputed" → fila con border-left ámbar 3px.
- Si la challenge window expira en <30min → pulsing dot en la status pill.

### 7.7 `/resolutions/[questionId]` — Detalle de resolución

La pantalla con más identidad visual del producto. Centrada en un **timeline horizontal del ciclo de resolución**:

```
[Created] ────● Proposed ──────● Challenge ──────○ DVM Vote ──────○ Resolved
              Mar 1            Mar 1+2h           if disputed       outcome

Proposer: 0x7a3...     Bond: $750
Outcome proposed: YES

[Si hay disputa, expand este nodo con detalle]
Disputer: 0xa92...     Counter-bond: $750
Filed at: Mar 1, 2h 15m
Evidence: link to UMA Discord thread
```

Debajo del timeline:
- Card "Question & Rules" con texto oficial.
- Card "Market Impact" con la gráfica del precio del mercado durante todo el ciclo.
- Card "Voting" si está en DVM (mostrar votes Yes/No/Too early/Unknown).

### 7.8 `/signals` — Divergencias

Layout: lista vertical de "cards de divergencia". Cada card:

```
┌─────────────────────────────────────────────────────────────┐
│ [● Price Gap]                            Severity: ████░ 4/5│
│                                                             │
│ Will Bitcoin reach $200k by EOY 2026?                       │
│                                                             │
│ Polymarket implied prob: 32% ↓                              │
│ Chainlink BTC/USD:        $147,200                          │
│                                                             │
│ [── mini gráfica comparativa de 24h ──]                     │
│                                                             │
│ Detected: 2h ago    Last updated: 14m ago    [Investigate →]│
└─────────────────────────────────────────────────────────────┘
```

Filtros arriba: tipo de divergencia, severity threshold, time window.

### 7.9 `/ecosystem` — Métricas agregadas

Layout: dashboard con muchas gráficas.

**Sección 1 — KPI strip** (similar a home pero datos del ecosistema completo).

**Sección 2 — Volume & Activity:**
Dos gráficas grandes side by side:
- Volume over time (línea + barras).
- Active markets count over time.

**Sección 3 — Categories:**
Gráfica de barras horizontales: volumen por categoría last 30d.

**Sección 4 — Calibration:**
Scatter plot: predicted probability vs realized outcome para todos los mercados resueltos. Línea diagonal de calibración perfecta como referencia.

**Sección 5 — Top wallets:**
Tabla de las 20 wallets más activas: address, total volume, markets traded, PnL, success rate.

### 7.10 `/settings` — Settings

Simple. Tres tabs:
1. **Profile:** email, display name, change password.
2. **API:** mostrar API key personal del usuario para integraciones (con regenerate button).
3. **Preferences:** tema (dark/light/auto), zona horaria, idioma (si aplica).

---

## 8. Responsive

**Breakpoints:**
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

**Adaptaciones mobile:**
- Sidebar → bottom navigation con 5 iconos.
- Top bar → solo logo + búsqueda + user (compacta).
- Tablas → versión card vertical (cada fila se vuelve una mini-card).
- Gráficas → mantienen ancho pero altura reducida a 280px.
- Layouts de 2 columnas → stack vertical.
- Market detail: tabs siguen funcionando, panel lateral se convierte en sección al final.

**Pantallas críticas en mobile:**
Dashboard, market detail y resolutions deben funcionar perfectamente en móvil. El resto pueden ser "best effort".

---

## 9. Microinteracciones

Reglas:
- Hovers de filas y cards: cambio de fondo en 150ms ease-out.
- Transiciones de página: fade-in del contenido en 200ms, sin transiciones de slide.
- Números que cambian (live updates de precio): flash brevísimo de color (verde si sube, rojo si baja) durante 600ms.
- Skeletons: shimmer con período de 1.5s.
- Tooltips: aparición con delay de 400ms, desaparición instantánea.
- Toasts/notifications: deslizan desde abajo-derecha, auto-dismiss en 5s.

---

## 10. Iconografía

**Set:** Lucide Icons (open source, viene con shadcn/ui).

**Iconos clave a usar:**
- Sidebar nav: `LayoutDashboard`, `TrendingUp`, `Scale`, `GitBranch`, `Globe`, `Search`, `Settings`.
- Tablas: `ArrowUp`, `ArrowDown`, `Copy`, `ExternalLink`, `MoreHorizontal`.
- Estados: `CheckCircle`, `AlertCircle`, `XCircle`, `Clock`.
- Acciones: `Play`, `Pause`, `RefreshCw`, `Download`, `Filter`.

**No usar:**
- Emojis decorativos en UI.
- Iconos rellenos (preferir outline).
- Múltiples sets mezclados.

---

## 11. Entregables esperados del modelo o diseñador

1. **Design system completo** implementado en código (Tailwind config + componentes base shadcn/ui customizados).
2. **Implementación de las 10 pantallas** del sitemap como páginas Next.js con datos mockeados.
3. **Componentes reutilizables** documentados (KPI Card, Data Table, Chart Container, Status Pill, Address Pill, Tab Bar, Global Search).
4. **Versión responsive** funcional para las pantallas críticas (Dashboard, Market Detail, Resolutions).
5. **Light mode** como variante secundaria (mismo layout, paleta clara: fondos blanco/gris muy claro, mismos accents).

---

## 12. Prompt resumido para pegar a una IA generadora

> Build a professional web dashboard called "GSR Market Intelligence", a tool for analysts and quant traders to monitor and analyze Polymarket prediction markets. Visual reference: combine Dune Analytics + Etherscan + TradingView aesthetics. Dark mode by default (#0B0E14 base, #141821 cards), accent blue #4F8CFF, semantic colors green/red/amber/cyan for success/danger/warning/info. Use Inter sans-serif for text, JetBrains Mono for all numbers, addresses and hashes. Layout: 56px sticky top bar with global search, 64px collapsible sidebar (icons only, expand on hover), max-width 1440px main content. Build 10 pages with mocked data: /login, / (dashboard with KPI strip, top markets table, resolution watchdog teaser, divergence cards), /markets (filterable table), /markets/[slug] (CRITICAL: 8/4 column split with big price chart with intervals 1H/4H/1D/1W/MAX, multi-tab content Trades/Orderbook/Holders/Resolution/Signals, sidebar with stats and linked contracts), /contracts/[address] (on-chain explorer with activity charts and transactions table), /resolutions (Resolution Watchdog table with status pills and live countdowns, this is the UNIQUE feature), /resolutions/[id] (horizontal timeline of UMA Oracle resolution cycle), /signals (vertical list of divergence cards comparing Polymarket prices vs Chainlink), /ecosystem (volume charts, calibration scatter plot, top wallets table), /settings. Reusable components: KPI Card with sparkline, Data Table (dense, sticky header, sorting, pagination), Chart Container with interval toggles, Status Pill (colored dot + label), Address Pill (truncated mono with copy and external link), Tab Bar with underline indicator, Global Search with grouped results (Markets/Wallets/Contracts/Tags) and ⌘K shortcut. Use Lucide icons, shadcn/ui components, TradingView Lightweight Charts for time series, Recharts for bars/pies/scatter. Responsive: sidebar becomes bottom nav on mobile, tables become card stacks. NO decorative illustrations, NO emojis in UI, skeleton loaders (never spinners), monospace numbers everywhere. The product feels like a Bloomberg Terminal for prediction markets, not a betting app.

---

## 13. Notas finales

- **Mockear datos realistas:** usar nombres de mercados reales (sacados de Polymarket) y direcciones reales de Polygon para que el resultado se vea genuino.
- **No inventar funcionalidad:** si una pantalla no está en este brief, no añadirla.
- **Prioridad de implementación:** Dashboard → Market Detail → Resolutions → Signals → resto.
- **Calidad por encima de cantidad:** mejor 5 pantallas pulidas que 10 a medias.
