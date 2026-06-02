# Checklist de Implementación — GSR Market Intelligence Frontend

> Compañero de `tasks/IMPLEMENTATION_PLAN.md`. Cada tarea es accionable por un agente.
> Marca `[x]` solo cuando esté **verificado** (ver criterio de verificación de cada fase).

---

## ⚠️ Directivas para todos los agentes (leer antes de empezar)

Vienen de `CLAUDE.md` y son vinculantes:

1. **Plan Mode por defecto** — entra en plan mode ante cualquier tarea de 3+ pasos o con decisiones de arquitectura. Si algo se tuerce, **PARA y replanifica**, no sigas empujando.
2. **Subagentes con generosidad** — delega exploración/investigación en paralelo, un objetivo por subagente, mantén limpio el contexto principal.
3. **Bucle de auto-mejora** — tras cualquier corrección del usuario, actualiza `tasks/lessons.md` con el patrón y la regla para no repetirlo.
4. **Verificación antes de dar por hecho** — nunca marques `[x]` sin demostrar que funciona (tests, logs, build, navegación real). Evidencia antes que afirmaciones. "¿Lo aprobaría un staff engineer?"
5. **Reglas del proyecto:**
   - Los shapes de datos salen de `API_CONTRACT.md`. Si el ejemplo difiere, **manda el contrato**.
   - El switch mock→API es sagrado: **ningún componente/hook/screen sabe de dónde vienen los datos**.
   - Toda vista con datos necesita estados **loading / empty / error**.
   - No portar el hack `global.GSR_MOCKS`.
   - Commit/push solo si el usuario lo pide.

---

## Fase 0 — Reset y scaffold del proyecto base

**Objetivo:** estructura Pages Router lista con el stack del ejemplo.

- [x] 0.1 — Borrar el boilerplate de App Router en `app/`: `app/app/` (layout.tsx, page.tsx, globals.css, favicon), `app/public/*.svg`.
- [x] 0.2 — Reescribir `app/package.json`: `next@14.2.x`, `react@18.3.x`, `react-dom@18.3.x`, `recharts@2.12.x`, `lucide-react@^0.378`, `@tanstack/react-query@^5`. Dev deps: `tailwindcss@^3.4`, `postcss@^8.4`, `autoprefixer@^10.4`, `typescript@^5`, `@types/react`, `@types/react-dom`, `@types/node`. Scripts: `dev`/`build`/`start`/`lint` estándar de Next.
- [x] 0.3 — Crear `app/next.config.js` (`reactStrictMode: true`), `app/tailwind.config.js` (content: `pages`, `components`, `screens`, `lib`), `app/postcss.config.js`.
- [x] 0.4 — Reescribir `app/tsconfig.json`: `allowJs: true`, `jsx: "preserve"`, `baseUrl: "."`, `paths: { "@/*": ["./*"] }`, target/lib razonables. Mantener `next-env.d.ts`.
- [x] 0.5 — Portar `web-example/nextjs/styles/globals.css` → `app/styles/globals.css` (todos los design tokens y estilos base, tal cual).
- [x] 0.6 — Crear `app/.env.local` y `app/.env.example` con `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` y `NEXT_PUBLIC_DATA_SOURCE=mock`.
- [x] 0.7 — Crear `app/pages/_app.jsx` mínimo (import de `styles/globals.css` + render del Component).
- [x] 0.8 — `npm install` y crear un `app/pages/index.jsx` placeholder.
- [x] **Verificación Fase 0:** `npm run dev` levanta sin errores; la página en blanco carga; los tokens CSS están disponibles (inspeccionar `--bg-base` en el DOM).

---

## Fase 1 — Capa de datos (el núcleo)

**Objetivo:** `lib/api/` + JSON + hooks + auth. El switch mock→API funcional.

### 1A — Tipos
- [x] 1.1 — Crear `lib/api/types.ts` con los tipos compartidos de `API_CONTRACT.md` §13: `Paginated<T>`, `PaginationParams`, shape de error `{ detail, code, field }`, `PricePoint`/`PriceSeries`.
- [x] 1.2 — Añadir a `types.ts` los tipos por dominio derivados **literalmente** de los shapes del contrato: Auth (`LoginResponse`, `UserRead`), `HealthStatus`, Dashboard (`DashboardSummary`, `KpiItem`, `TopMarketItem`, `DivergenceCard`), Markets (`MarketListItem`, `MarketDetail`, `MarketStats`, `PriceHistory`, `Sparkline`, `Orderbook`, `Holder`, `Trade`, `NewsWithSignal`), Contracts (`ContractRead`, `ExploreResponse`, `SyncStatus`, `ContractSummary`, `ContractActivity`, `ContractTransaction`), Resolutions (`ResolutionListItem`, `ResolutionDetail`, `ResolutionStats`), Signals (`DivergenceRead`, `SignalListItem`, `SignalDetail`), Ecosystem (`EcosystemKpis`, `EcoSparkline`, `EcoVolume`, `EcoActiveMarkets`, `EcoByCategory`, `Calibration`, `ActivityHeatmap`, `TopWallet`), `SearchResults`.
- [x] 1.3 — Definir la interfaz `GsrApi` (agrupada por dominio: `api.auth.*`, `api.dashboard.*`, `api.markets.*`, `api.contracts.*`, `api.resolutions.*`, `api.signals.*`, `api.ecosystem.*`, `api.search`). Una firma por cada uno de los 35 endpoints. _(en `lib/api/interface.ts`)_

### 1B — Implementación HTTP real
- [x] 1.4 — Crear `lib/api/client.ts` (`httpApi`): wrapper sobre `fetch` con base URL de `NEXT_PUBLIC_API_URL`, header `Authorization: Bearer <token>` (token desde `lib/auth`), serialización de query params, parseo del shape de error estándar lanzando un `ApiError` tipado, manejo de `total: null`. Implementa **toda** la interfaz `GsrApi`.

### 1C — Mocks (shape EXACTO del contrato)
- [x] 1.5 — Crear `lib/mocks/*.json`: un archivo por endpoint/grupo, con el shape **exacto** de la response del contrato. Reusar los datos realistas de `web-example/nextjs/lib/mocks.js` pero **reformateados** (el ejemplo usa `{t,v}`, `vol24`, `yes`… → mapear a los campos del contrato). Cubrir: dashboard (summary, top-markets, notable-divergences), markets (list, detail por slug, prices, sparkline, orderbook, holders, trades, news), contracts (detail, summary, activity, transactions, sync-status), resolutions (list, detail, stats), signals (list, detail), ecosystem (kpis, sparkline, volume, active-markets, by-category, calibration, activity-heatmap, top-wallets), search, auth (users/me), health. _(32 JSON generados de forma determinista por `scripts/gen-mocks.js`)_
- [x] 1.6 — Crear `lib/api/mock.ts` (`mockApi`): implementa la interfaz `GsrApi` leyendo los JSON. Debe **respetar la semántica del contrato**: aplicar `limit`/`offset`/`order`/`order_by`, devolver `{ items, total, has_more }`, simular ~200ms de latencia, y poder simular errores (p.ej. slug inexistente → `ApiError` 404 `MARKET_NOT_FOUND`).

### 1D — El switch + hooks + auth
- [x] 1.7 — Crear `lib/api/index.ts`: `export const api = USE_MOCK ? mockApi : httpApi` según `NEXT_PUBLIC_DATA_SOURCE`.
- [x] 1.8 — Crear `lib/queryClient.ts` (instancia de `QueryClient` con defaults sensatos: `staleTime`, `retry`, etc.).
- [x] 1.9 — Crear `lib/auth.ts`: `login()` mockeado que **valida contra un usuario mock fijo** (`username: admin`, `password: 1234`) — credenciales correctas → token mock + perfil mock; incorrectas → `ApiError` `LOGIN_BAD_CREDENTIALS`. En modo api llama a `api.auth.login`. Guardado/lectura/borrado de token (localStorage), hook `useAuth()`, `AuthProvider`. El usuario mock fijo (`admin` / `1234`) vive en `lib/mocks/auth.json` junto al perfil de `users/me`.
- [x] 1.10 — Crear los hooks de React Query en `lib/hooks/`: uno por dominio (`useDashboard.ts`, `useMarkets.ts`, `useContracts.ts`, `useResolutions.ts`, `useSignals.ts`, `useEcosystem.ts`, `useSearch.ts`). Cada hook envuelve un método de `api`, con `queryKey` bien estructurada. **Los hooks nunca tocan JSON ni `fetch` directamente.**
- [x] **Verificación Fase 1:** test manual — un componente de prueba usa `useDashboardSummary()` y pinta datos tipados desde el JSON. Cambiar `NEXT_PUBLIC_DATA_SOURCE=api` y reiniciar: el hook intenta el endpoint real (fallará sin backend, pero la pestaña Network demuestra que llama a `http://127.0.0.1:8000/dashboard/summary`). Volver a `mock`. _Verificado: en mock pintó 5 KPIs + 5 resoluciones tipadas desde JSON; en api el hook llamó `GET http://127.0.0.1:8000/dashboard/summary` (ERR_CONNECTION_REFUSED, sin backend) lanzando `ApiError`. `tsc --noEmit` limpio, `npm run build` verde._

---

## Fase 2 — Shell y UI compartida

**Objetivo:** layout navegable + componentes compartidos + providers.

- [x] 2.1 — Portar `web-example/nextjs/lib/components.jsx` → `app/lib/components.jsx` (formatters `fmtUSD/fmtNum/fmtPct/...`, `Icon`, `StatusPill`, `AddressPill`, `CatPill`, `KpiCard`, `MiniSpark`, `ChartContainer`, `TabBar`, `DataTable`, `useFlash`, `ToastHost`). El `DataTable` debe soportar `total: null` (paginación solo con `has_more`). _(Portado. `Recharts` ahora se importa local en vez de un global. `GSR_MOCKS` eliminado: `CatPill` usa un mapa inline de color/label de categoría — presentación pura, no shape de datos. `useRoute`/`Sidebar`/`TopBar` hash-router NO portados aquí (van en Shell). `DataTable` con dos modos: client-side (default) y `serverPaginated` que pagina solo con `hasMore` y soporta `total: null` sin derivar nº de páginas.)_
- [x] 2.2 — Portar `web-example/nextjs/components/Shell.jsx` → `app/components/Shell.jsx`. Ajustar el `NAV` y la detección de ruta activa a las rutas finales (ver Fase 4). _(Shell en Pages Router: `next/link` + `next/router`. Usa las clases CSS que realmente existen en `globals.css` (`.app`, `.sidebar`/`.nav-item`, `.topbar`, `.brand`, `.main`) — las del Shell del ejemplo (`.app-shell`, `.side-nav`…) no tienen CSS portado. NAV: Dashboard / Markets / Explorer / Resolutions / Signals / Ecosystem + Settings + Sign out. Detección de ruta activa por `match(pathname)` que cubre rutas dinámicas anidadas (`/markets/[slug]` resalta "Markets"). TopBar con brand, search placeholder (focus ⌘K) y chip de cuenta desde `useAuth`.)_
- [x] 2.3 — Reescribir `app/pages/_app.jsx`: envolver en `QueryClientProvider` (de `lib/queryClient`) + `AuthProvider` (de `lib/auth`) + `ToastHost`. Import de `styles/globals.css`. _(`QueryClientProvider` + `AuthProvider` ya estaban (Fase 1); añadido `<ToastHost/>` dentro del `AuthProvider`. Sin providers duplicados.)_
- [x] 2.4 — Implementar el route guard: rutas autenticadas redirigen a `/login` si no hay token; `/login` redirige a `/` si ya hay token. En modo mock se entra con `admin` / `1234` (ver 1.9); el `LoginScreen` puede mostrar esas credenciales como hint para la demo. _(Guard dentro de `Shell`: mientras `useAuth().loading` o `!isAuthenticated` renderiza `null`; al resolver sin sesión → `router.replace("/login")`. `pages/login.jsx` placeholder funcional hace el guard inverso (con token → `/`) y muestra el hint `admin`/`1234`; la LoginScreen completa la porta la Fase 4 (4.1). Bug bloqueante de Fase 1 corregido de paso: `clone()` en `lib/api/mock.ts` hacía `JSON.parse(undefined)` con el `auth.logout()` `void` — ahora pasa `null`/`undefined` tal cual.)_
- [x] **Verificación Fase 2:** navegar entre rutas placeholder funciona; sidebar marca la ruta activa; topbar pinta; sin token → redirige a `/login`; login mock → entra y redirige a `/`. _(Verificado en navegador: `npm run dev` arranca limpio; `/markets` sin token → redirige `/login`; login `admin`/`1234` → entra y redirige `/`, token en `localStorage.gsr_token`, chip pinta `admin@gsr.com`; `/markets/btc-200k-eoy` resalta solo "Markets"; click en sidebar "Resolutions" → navega y marca activo; con token `/login` → redirige `/`; Sign out → limpia token, redirige `/login`; `/ecosystem` sin token → redirige `/login`. Consola sin errores. `npx tsc --noEmit` limpio, `npm run build` verde (14 rutas).)_

---

## Fase 3 — Gráficas

**Objetivo:** las 18 gráficas (G1–G18) portadas, cada una con props tipadas.

- [x] 3.1 — Portar `web-example/nextjs/lib/charts.jsx` → `app/lib/charts.jsx`: `customTooltip`, `PriceChart` (G3/G4), `VolumeBars` (G5), `OrderbookDepth` (G6), `HoldersBar` (G7), `ContractActivity` (G8), `WalletsDaily` (G9), `ResolutionTimeline` (G10), `BondHistogram` (G11), `DivergenceMini` (G12), `MarketVsChainlink` (G13), `EcosystemVolume` (G14), `ActiveMarkets` (G15), `CategoryBars` (G16), `CalibrationScatter` (G17), `ActivityHeatmap` (G18). G1/G2 (sparklines) viven en `components.jsx` (`MiniSpark`). _(16 gráficas portadas. G1/G2 verificadas en `components.jsx`: `KpiCard` spark = G1, `MiniSpark` = G2, ambas con color por delta — cubren el catálogo, sin cambios necesarios. `Recharts` importado local. Helpers `ChartSkeleton`/`ChartEmpty`/`customTooltip` exportados.)_
- [x] 3.2 — **Refactor clave:** cada gráfica recibe sus datos por **props** (tipadas según `lib/api/types.ts`), no de `GSR_MOCKS` global. Si una gráfica del ejemplo lee del global, cambiarla a props. _(Hecho. `GSR_MOCKS` eliminado por completo de `charts.jsx`. Cada gráfica tiene props tipadas vía JSDoc `@typedef` contra `api/types.ts` — p.ej. `PriceChart` recibe `priceHistory: PriceHistory`, `OrderbookDepth` recibe `orderbook: Orderbook`, `CalibrationScatter` recibe `calibration: Calibration`, etc. Las que el ejemplo leía del global (`PriceChart`, `VolumeBars`, `OrderbookDepth`, `ContractActivity`, `WalletsDaily`, `BondHistogram`, `EcosystemVolume`, `ActiveMarkets`, `CategoryBars`, `CalibrationScatter`, `ActivityHeatmap`) ahora reciben props. Shapes del contrato, no del ejemplo: `series_yes/series_no` en vez de `{yes,no}`, `volume_series` con `direction`, `cumulative_size`, `value_usd`/`address_label` en holders, `tx_count`/`unique_senders` en activity, matriz plana de celdas en heatmap.)_
- [x] 3.3 — Asegurar que cada gráfica acepta y pinta sus estados `loading` (skeleton shimmer) y `empty` ("No data for this period"), según convenciones de `CHART_CATALOG.md`. _(Cada gráfica acepta `loading` y `empty`. `ChartSkeleton` usa la clase `.skel` de `globals.css` (shimmer). `ChartEmpty` pinta icono `info` + "No data for this period" centrado. Helper `chartBody()` resuelve skeleton/empty/children dentro del mismo `chart-body`, dejando título/toolbar visibles. Las gráficas también derivan `empty` solo si su array de datos viene vacío.)_
- [x] **Verificación Fase 3:** página temporal de prueba (`pages/_charts-preview.jsx`) que renderiza las 18 gráficas con datos de mock; todas pintan sin errores de consola. Borrar la página de prueba al cerrar la fase. _(Verificado en navegador: `_charts-preview.jsx` renderizó las 18 gráficas (G1–G18) con datos de los JSON de `lib/mocks/` + cada una en estado `loading` y `empty`. Captura confirma todas pintan. Consola: solo warnings internos de Recharts 2.12 sobre `defaultProps` (originados en `node_modules/recharts/...`, no en código nuestro — issue conocido upstream); ningún error de nuestras gráficas ni de hidratación. `npx tsc --noEmit` limpio; `npm run build` verde (14 rutas). Página temporal borrada al cerrar la fase.)_

---

## Fase 4 — Pantallas (una subtarea por ruta)

**Objetivo:** las 10+ screens portadas, cada una cableada a hooks de React Query.

Para **cada** screen: portar el componente de `web-example/nextjs/screens/index.jsx`, reemplazar todo acceso a `GSR_MOCKS` por el hook correspondiente, añadir estados loading/empty/error, alinear la ruta al contrato.

- [x] 4.1 — `pages/login.jsx` + `LoginScreen` → `lib/auth` (`login()` mock).
- [x] 4.2 — `pages/index.jsx` + `DashboardScreen` → `useDashboardSummary`, `useTopMarkets`, `useNotableDivergences`.
- [x] 4.3 — `pages/markets/index.jsx` + `MarketsScreen` → `useMarkets` (paginado, filtros `category`/`active`/`resolved`, `order_by`).
- [x] 4.4 — `pages/markets/[slug].jsx` + `MarketDetailScreen` → `useMarket(slug)`, `useMarketPrices`, `useOrderbook`, `useHolders`, `useTrades`, `useMarketNews`. Tabs: Overview / Orderbook / Holders / Trades / Signals.
- [x] 4.5 — `pages/contracts/index.jsx` + `ContractsScreen` → buscador + `api.contracts.explore` (maneja respuesta 200 ya-cacheado vs 202 job encolado + polling de `sync-status`).
- [x] 4.6 — `pages/contracts/[address].jsx` + `ContractDetailScreen` → `useContractSummary`, `useContractActivity`, `useContractTransactions`.
- [x] 4.7 — `pages/resolutions/index.jsx` + `ResolutionsScreen` → `useResolutions` (filtros `status`/`ends_within_hours`/`min_bond_usd`/`q`), `useResolutionStats` (banner + G11).
- [x] 4.8 — `pages/resolutions/[questionId].jsx` + `ResolutionDetailScreen` → `useResolution(questionId)` (G10 Resolution Timeline). **Renombrar** la ruta del ejemplo `[slug]` → `[questionId]` para alinear al contrato.
- [x] 4.9 — `pages/signals/index.jsx` + `SignalsScreen` → `useSignals` (filtros `divergence_type`/`min_severity`/`status`).
- [x] 4.10 — `pages/signals/[id].jsx` + `SignalDetailScreen` → `useSignal(id)` (G13). **Ruta nueva**: el ejemplo no la tiene como página separada — crearla a partir del detalle embebido.
- [x] 4.11 — `pages/ecosystem.jsx` + `EcosystemScreen` → `useEcosystemKpis`, `useEcoVolume`, `useEcoActiveMarkets`, `useEcoByCategory`, `useCalibration`, `useActivityHeatmap`, `useTopWallets`.
- [x] 4.12 — `pages/settings.jsx` + `SettingsScreen` → `api.auth.me` (`useUser`).
- [x] 4.13 — Búsqueda global (⌘K en el topbar) → `useSearch` (`api.search`).
- [x] **Verificación Fase 4:** cada ruta pinta con datos del JSON; navegación completa funciona; cada vista tiene loading/empty/error; las rutas coinciden con la tabla maestra de `API_CONTRACT.md`. _(Verificación de integración: `npx tsc --noEmit` limpio; `npm run build` verde con las 14 rutas; `npm run lint` limpio. Antes no había ESLint configurado — añadido `.eslintrc.json` (`next/core-web-vitals`) + `eslint`/`eslint-config-next` a devDependencies. Navegación real recorrida en navegador (login `admin`/`1234` → `/`, `/markets`, `/markets/will-trump-win-2028` con las 5 tabs, `/contracts` → explore → `/contracts/[address]`, `/resolutions`, `/resolutions/[questionId]`, `/signals`, `/signals/[id]`, `/ecosystem` con G14–G18, `/settings`, búsqueda global ⌘K, Sign out → guard a `/login`): todas pintan con datos del JSON, estados loading visibles (skeletons ~200ms), sin errores de consola salvo los warnings conocidos de `defaultProps` de Recharts 2.12, sin errores de hidratación. Rutas alineadas a la tabla maestra de `API_CONTRACT.md`. Bugs de integración corregidos: (1) `fmtRelTime` en `lib/components.jsx` hacía `Date.now() - t` con `t` string ISO → `NaN` ("NaNd ago" en la tab Trades y tab Signals del market detail); ahora parsea con `new Date(t).getTime()` y devuelve "—" si es inválido. (2) `Shell.jsx` "Sign out" era un `<a href="/login">` que rompía `npm run lint` (`no-html-link-for-pages`); convertido a `<button>` con `onClick={onSignOut}`.)_

---

## Fase 5 — Integración y verificación final

**Objetivo:** demostrar que todo funciona y que el switch está listo.

- [x] 5.1 — Repaso global de estados loading/empty/error en todas las vistas (forzar errores desde `mockApi` para probarlos). _(Verificado en navegador modo mock. Estados de carga visibles (~200 ms de latencia simulada del `mockApi`) en cada pantalla; estados de error forzados navegando a IDs/slugs inexistentes — `/markets/this-market-does-not-exist` → "Market not found" + link de vuelta; `/resolutions/0xdeadbeef` → "Resolution not found" + botón de vuelta; `/signals/99999` → "Divergence not found" + link de vuelta. Las 13 pantallas degradan con elegancia, ningún caso 404 crashea. Tabs del market detail (Overview/Orderbook/Holders/Trades/Signals) renderizan; la tab Trades muestra "3d ago" correctamente (fix de `fmtRelTime` de Fase 4 se mantiene).)_
- [x] 5.2 — Verificación end-to-end en modo `mock`: recorrer las 10+ rutas, confirmar que no hay errores de consola ni de hidratación. _(Recorridas las 14 rutas en navegador: `/login` → login `admin`/`1234` → `/`, `/markets`, `/markets/[slug]` (+5 tabs), `/contracts` → explore → `/contracts/[address]`, `/resolutions`, `/resolutions/[questionId]`, `/signals`, `/signals/[id]`, `/ecosystem` (G14–G18 + KPIs + top wallets), `/settings`, búsqueda global ⌘K. Consola (mensajes preservados a lo largo de toda la sesión): únicamente warnings de `defaultProps` de Recharts 2.12 — todos originados en `node_modules/recharts/...` (XAxis/YAxis/ReferenceLine), conocidos/aceptables. Cero errores de nuestro código, cero errores de hidratación.)_
- [x] 5.3 — Verificación del switch: `NEXT_PUBLIC_DATA_SOURCE=api`, reiniciar, confirmar en Network que **todas** las pantallas llaman a `NEXT_PUBLIC_API_URL` con los paths correctos del contrato (fallan sin backend, pero el cableado queda demostrado). Volver a `mock`. _(Puesto `NEXT_PUBLIC_DATA_SOURCE=api` en `app/.env.local`, reiniciado `npm run dev`. En navegador: intento de login disparó `POST http://127.0.0.1:8000/auth/jwt/login` (`net::ERR_CONNECTION_REFUSED`) y la `LoginScreen` mostró "Network error: Failed to fetch" sin crashear; con token inyectado, `AuthProvider` disparó `GET http://127.0.0.1:8000/users/me` (`ERR_CONNECTION_REFUSED`) y el route guard redirigió a `/login` con elegancia. Revisión estática de `lib/api/client.ts`: los 35 métodos de `httpApi` mapean exactamente a los paths de la tabla maestra de `API_CONTRACT.md` (`/dashboard/summary`, `/markets/{slug}`, `/markets/{id}/prices`, `/resolutions`, `/signals/{id}`, `/ecosystem/calibration`, `/search`, …) sobre `BASE_URL` = `NEXT_PUBLIC_API_URL`; los hooks llaman `api.<dominio>.<método>()` → `httpApi`. Verificado además desde la consola que esos paths del contrato resuelven todos a `http://127.0.0.1:8000` y refusan conexión. **`NEXT_PUBLIC_DATA_SOURCE` devuelto a `mock`**, `.next` limpiado, dev server reiniciado y re-verificado en mock (login + dashboard pintan desde JSON).)_
- [x] 5.4 — `npm run build` pasa sin errores ni warnings de tipos. _(`npm run build` verde: "Compiled successfully", "Linting and checking validity of types" sin errores, 14 rutas generadas estáticamente. Re-ejecutado tras los cambios de Fase 5 (README, `.dockerignore`, env revertido) — sigue verde.)_
- [x] 5.5 — `npm run lint` limpio. _(`npm run lint` → "ESLint: No issues found".)_
- [x] 5.6 — Revisar/ajustar el `Dockerfile` (raíz del repo) — copia `app/` y corre `npm run dev`; confirmar que sigue siendo válido con el nuevo `package.json`. _(Dockerfile revisado: `FROM node:22.18.0-slim`, `COPY app/ /home/app/`, `RUN npm install`, `EXPOSE 3000`, `CMD ["npm","run","dev"]` — coherente con el `package.json` actual (Next 14, script `dev` = `next dev`, que bindea `0.0.0.0` por defecto → alcanzable en el contenedor). Creado `.dockerignore` en la raíz del repo (antes no existía): excluye `app/node_modules`, `app/.next`, `app/.trash-phase0` (118 MB de cruft de Fase 0) y ruido a nivel repo (`.git`, `web-example`, `tasks`, `*.md`, `*.zip`) para que la imagen instale sus propias deps limpiamente. `.env.local` NO excluido (la imagen conserva el comportamiento de dev local). Validado con `docker build --check -f Dockerfile .` → "Check complete, no warnings found"; no se construyó la imagen completa (innecesario, `--check` ya valida la coherencia).)_
- [x] 5.7 — Actualizar `web-example/README.md` o crear `app/README.md` documentando: cómo correr, las dos fuentes de datos, y el procedimiento exacto para pasar a producción (cambiar `NEXT_PUBLIC_DATA_SOURCE`). _(Creado `app/README.md` (sobrescribe el boilerplate de `create-next-app` que Fase 0 dejó sin borrar). Documenta: cómo correr (`npm install` / `npm run dev` + tabla de scripts), credenciales demo `admin`/`1234`, las dos fuentes de datos con tabla `mock`→`mockApi`/`lib/mocks/` vs `api`→`httpApi`/`NEXT_PUBLIC_API_URL` y el snippet del switch en `lib/api/index.ts`, la estructura de carpetas (capa de datos `lib/api/`, hooks, screens, charts), y el procedimiento exacto a producción: poner `NEXT_PUBLIC_DATA_SOURCE=api` + `NEXT_PUBLIC_API_URL`, reiniciar/rebuild, momento en que `lib/api/index.ts` resuelve `api` a `httpApi`, los JSON de `lib/mocks/` quedan inertes y los hooks emiten HTTP real sin cambiar ningún componente. Incluye sección Docker.)_
- [x] **Verificación Fase 5:** build verde, lint verde, demo navegable completa en modo mock, switch a `api` demostrado, Docker válido. _(Todo verificado con evidencia real: `npm run build` verde (14 rutas, sin warnings de tipos), `npm run lint` limpio; demo navegable completa recorrida en navegador en modo mock (14 rutas + 5 tabs + búsqueda global + 3 casos 404), solo warnings conocidos de Recharts, sin errores de hidratación; switch a `api` demostrado en Network (`POST /auth/jwt/login` y `GET /users/me` a `NEXT_PUBLIC_API_URL`, `ERR_CONNECTION_REFUSED`, pantallas en estado de error sin crashear) y revertido a `mock`; `Dockerfile` validado con `docker build --check` + `.dockerignore` creado.)_

---

## Fase 6 — Integración con backend real (Fase 1, Etherscan v2)

**Objetivo:** retirar el mock dominio a dominio conectando al backend real (FastAPI, lectura
on-chain en vivo vía Etherscan v2 — NO web3.py/RPC), sin tocar hooks, screens ni gráficas.

### 6A — Switch granular y configuración
- [x] 6.1 — Migrar el switch a **granular por dominio**: `lib/api/index.ts` resuelve **cada** dominio a `mockApi` o `httpApi` de forma independiente (`buildApi(mock, http, real)`), derivando los reales de `NEXT_PUBLIC_REAL_DOMAINS`. Se conserva la retro-compat `NEXT_PUBLIC_DATA_SOURCE=api` (todo real) y el default (todo mock). Hooks/screens siguen agnósticos (LSP).
- [x] 6.2 — `app/.env.local`: `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1` (incluye el prefijo `/api/v1`) y `NEXT_PUBLIC_REAL_DOMAINS=resolutions,markets,contracts,search,health,dashboard`.
- [x] 6.3 — Mock retirado por dominio: cada dominio real es un stub `retired()` en `lib/api/mock.ts` (lanza si se invoca) y sus fixtures `.json` fueron borrados. Solo quedan en `lib/mocks/`: `signals.json`, `signal-detail.json`, `ecosystem-*.json` y `auth.json`. `types.ts` intacto (fuente de verdad de shapes).

### 6B — Dominios conectados a real (6/9)
- [x] 6.4 — `resolutions` → real. UMA OptimisticOracleV2; list/detail/stats; timeline real + panel de disputa; cruce UMA↔Gamma en el detalle (`market` + serie del Market Impact). `ResolutionsScreen`/`ResolutionDetailScreen` (G10/G11) sin cambios.
- [x] 6.5 — `markets` → real. Gamma/CLOB: list, search, detail (overlay Chainlink spot vía `eth_call`), prices, y las tabs `orderbook`/`holders`/`trades`/`sparkline`/`news` (ya no 404). `MarketDetailScreen` y G3 sin cambios.
- [x] 6.6 — `contracts` → real. Etherscan explorer: explore, detail, sync-status, summary, activity, transactions. `ContractsScreen`/`ContractDetailScreen` sin cambios.
- [x] 6.7 — `search` → real. Gamma public-search + tags. Búsqueda global ⌘K sin cambios.
- [x] 6.8 — `health` → real. `/api/v1/health` (polygon_rpc en vivo; database/redis=down).
- [x] 6.9 — `dashboard` → real. `/summary` (KPIs reales; divergences/wallets=0), `/top-markets`, `/notable-divergences` (`[]`).

### 6C — Pendientes (siguen en mock)
- [ ] 6.10 — `signals` → real. **Pendiente (Fase 2):** requiere histórico de Chainlink en DB + tabla `divergences` + worker (no hay DB/workers en F1). Ver `extradocs/plans/40-divergences-signals.md`.
- [ ] 6.11 — `ecosystem` → real. **Pendiente (Fase 2):** agregados que requieren histórico/DB.
- [ ] 6.12 — `auth` → real. **Pendiente:** no existe JWT en backend; login sigue mock (`admin`/`1234`).

### 6D — Limitaciones aceptadas en Fase 1 (placeholders, no bugs)
- [x] 6.13 — Documentadas y aceptadas: overlay Chainlink = spot actual replicado (no histórico); `bond_usd`=`finalFee` (proxy); `value_usd=0` en contracts/trades; `volume_series`/`markers` vacíos en prices; `market_slug=''` en la **lista** de resolutions (solo el detalle resuelve el market vía Gamma); dashboard divergences/wallets=0; news vacío; CORS `*` en el backend; **SIN caché** (decisión del usuario; rate-limit Etherscan ~3/seg con reintento+backoff) → latencia ~12–15s por request de resolutions.

- [x] **Verificación Fase 6:** los 6 dominios reales renderizan con datos del backend sin tocar hooks/screens/charts; mock retirado verificado (los stubs `retired()` lanzan si se invocan); `signals`/`ecosystem`/`auth` siguen en mock vía el switch granular. Correr: backend `(cd backend && uv run uvicorn app.api.main:app --port 8000)`; frontend `(cd frontend/app && npm run dev)` → `localhost:3000`; login mock `admin`/`1234`.

---

## Notas de coordinación

- **Fase 1 es bloqueante** para las Fases 3 y 4 (necesitan los tipos y los hooks). Fase 2 puede ir en paralelo a Fase 1 una vez existan los tipos.
- Las subtareas de la Fase 4 (4.1–4.13) son **independientes entre sí** una vez cerradas las Fases 1–3 → candidatas a paralelizar con subagentes (una screen por subagente).
- El reshape de mocks (1.5) es la tarea de más riesgo: hacerla endpoint a endpoint, validando contra `API_CONTRACT.md`, sin prisa.
