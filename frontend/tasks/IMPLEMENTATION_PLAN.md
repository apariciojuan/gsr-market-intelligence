# Plan de Implementación — GSR Market Intelligence Frontend

> **Objetivo:** portar la web de referencia (`web-example/nextjs/`) sobre el proyecto `app/`, dejándola
> consumiendo **datos desde JSON** que imitan exactamente las respuestas del backend, pero estructurada
> para que pasar a **endpoints reales** sea cambiar **una sola variable de entorno**.

---

## 0. Directivas obligatorias para los agentes

Estas directivas vienen de `CLAUDE.md` y son **vinculantes** para cualquier agente que ejecute una tarea de este plan:

### Orquestación del trabajo
- **Plan Mode por defecto:** ante cualquier tarea no trivial (3+ pasos o decisiones arquitectónicas), entra en plan mode antes de tocar código.
- **Si algo se tuerce, PARA y replanifica.** No sigas empujando una solución que no encaja.
- Usa plan mode también para los pasos de verificación, no solo para construir.
- Escribe specs detalladas antes de empezar para reducir ambigüedad.

### Estrategia de subagentes
- Usa subagentes con generosidad para mantener limpio el contexto principal.
- Delega investigación, exploración y análisis en paralelo a subagentes.
- Para problemas complejos, lanza más cómputo vía subagentes.
- Un objetivo por subagente: ejecución enfocada.

### Bucle de auto-mejora
- Tras **cualquier corrección del usuario**: actualiza `tasks/lessons.md` con el patrón.
- Escribe reglas para ti mismo que eviten repetir el mismo error.
- Itera sin piedad sobre esas lecciones hasta bajar la tasa de error.
- Repasa `tasks/lessons.md` al inicio de cada sesión.

### Verificación antes de dar por hecho
- **Nunca marques una tarea como completa sin demostrar que funciona.**
- Cuando aplique, compara el comportamiento entre `main` y tus cambios.
- Pregúntate: "¿Un staff engineer aprobaría esto?"
- Ejecuta tests, revisa logs, demuestra correctitud. Evidencia antes que afirmaciones.

### Reglas específicas de este proyecto
- **No inventes shapes de datos.** Toda estructura de datos sale de `API_CONTRACT.md`. Si el contrato y el ejemplo difieren, **manda el contrato** (el ejemplo es solo UI de referencia).
- **El switch mock→API es sagrado:** ningún componente, hook o screen puede saber de dónde vienen los datos. Si un agente acopla un screen a un JSON directamente, la tarea está mal hecha.
- Cada vista con datos necesita sus estados **loading / empty / error** (ver convenciones en `CHART_CATALOG.md`).
- Commits y push: solo cuando el usuario lo pida.

---

## 1. Decisiones arquitectónicas (cerradas)

| Tema | Decisión | Motivo |
|---|---|---|
| **Router** | **Pages Router** | El ejemplo entero está en Pages Router → port casi 1:1, riesgo mínimo. La app es un terminal interactivo tras login: casi todo es client-side, App Router aporta poco aquí. |
| **Stack base** | Igualar al ejemplo: **Next 14, React 18, Recharts 2.12, Tailwind 3, lucide-react** | El `app/` actual es solo boilerplate de `create-next-app`, descartable. El stack del ejemplo es conocido-bueno y ya probado. |
| **Lenguaje** | **TypeScript en la capa de datos** (`lib/api/`, `lib/hooks/`, tipos), **JSX** en la UI portada del ejemplo. `allowJs: true`. | TS aporta muchísimo tipando los 35 endpoints del contrato. Convertir ~1.800 líneas de UI a TS es trabajo/riesgo no solicitado; migrable después screen a screen. |
| **Fetching** | **React Query (`@tanstack/react-query`)** + capa adapter con interfaz única | Es la clave del switch mock→API. El propio `API_CONTRACT.md` menciona el cache de React Query. |
| **Charts** | **Recharts + SVG custom**, tal cual el ejemplo | Decisión del usuario. `CHART_CATALOG.md` queda como guía para mejoras futuras (Lightweight Charts / D3), no como requisito del MVP. |
| **`API_CONTRACT.md` / `CHART_CATALOG.md`** | Guía de referencia para shapes y comportamiento, no dogma de implementación | `API_CONTRACT.md` **sí** es la fuente de verdad para los shapes de datos. `CHART_CATALOG.md` es orientativo para el detalle visual. |

---

## 2. Arquitectura objetivo

```
frontend/app/
├── package.json              # Next 14, React 18, Recharts, Tailwind 3, @tanstack/react-query, lucide-react
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json             # allowJs:true, paths "@/*"
├── .env.local                # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_DATA_SOURCE
├── pages/
│   ├── _app.jsx              # QueryClientProvider + estilos globales + AuthProvider
│   ├── login.jsx
│   ├── index.jsx             # Dashboard
│   ├── markets/index.jsx
│   ├── markets/[slug].jsx
│   ├── contracts/index.jsx
│   ├── contracts/[address].jsx
│   ├── resolutions/index.jsx
│   ├── resolutions/[questionId].jsx
│   ├── signals/index.jsx
│   ├── signals/[id].jsx
│   ├── ecosystem.jsx
│   └── settings.jsx
├── components/
│   └── Shell.jsx             # sidebar + topbar + route guard
├── screens/
│   └── index.jsx             # las 10+ pantallas (portadas del ejemplo)
├── styles/
│   └── globals.css           # design tokens (portados de web-example)
└── lib/
    ├── components.jsx        # UI compartida (formatters, Icon, KpiCard, DataTable, Pills, Tabs…)
    ├── charts.jsx            # las 18 gráficas (G1–G18)
    ├── queryClient.ts        # instancia de QueryClient
    ├── auth.ts               # login mock, storage de token, useAuth()
    ├── api/
    │   ├── types.ts          # interfaces TS de los 35 endpoints + tipos compartidos
    │   ├── client.ts         # httpApi: fetch wrapper real (base URL, JWT, errores, paginación)
    │   ├── mock.ts           # mockApi: lee los JSON de lib/mocks/, simula latencia y paginación
    │   └── index.ts          # export const api = USE_MOCK ? mockApi : httpApi  ← EL SWITCH
    ├── hooks/
    │   ├── useDashboard.ts
    │   ├── useMarkets.ts
    │   ├── useContracts.ts
    │   ├── useResolutions.ts
    │   ├── useSignals.ts
    │   ├── useEcosystem.ts
    │   └── useSearch.ts
    └── mocks/                # JSON con el shape EXACTO de API_CONTRACT.md
        ├── dashboard-summary.json
        ├── markets.json
        ├── market-detail.json
        ├── ... (uno por endpoint o grupo)
```

### El mecanismo del switch mock→API

`lib/api/index.ts` expone una **única interfaz** `GsrApi` con dos implementaciones intercambiables:

```ts
// lib/api/index.ts
import { httpApi } from "./client";
import { mockApi } from "./mock";

const USE_MOCK = process.env.NEXT_PUBLIC_DATA_SOURCE !== "api";

export const api: GsrApi = USE_MOCK ? mockApi : httpApi;
```

- `mockApi` y `httpApi` implementan **exactamente la misma interfaz** `GsrApi` (mismas firmas, mismos tipos de retorno).
- Los hooks de React Query (`lib/hooks/*`) llaman a `api.markets.list(...)`, nunca a un JSON ni a `fetch` directamente.
- Las screens consumen los hooks, nunca `api` ni los JSON.
- **Para ir a producción:** `NEXT_PUBLIC_DATA_SOURCE=api`. Los JSON quedan muertos, `httpApi` toma el relevo. Cero cambios en componentes.

### Reglas de la capa de datos
- Los tipos en `types.ts` se derivan **literalmente** de los shapes de `API_CONTRACT.md` (incluido el wrapper `Paginated<T>`, el shape de error `{ detail, code, field }`, timestamps ISO, cantidades grandes como `string`).
- `mockApi` debe **respetar la semántica del contrato**: aplicar `limit`/`offset`/`order`, devolver `{ items, total, has_more }`, simular 200ms de latencia, y poder simular errores (404, etc.) para probar los estados de error.
- Los JSON de `lib/mocks/` se construyen reusando los datos realistas de `web-example/nextjs/lib/mocks.js`, pero **reformateados al shape del contrato** (el mock del ejemplo usa shapes sueltos: `{t,v}`, `vol24`, etc. — hay que mapearlos a los del contrato).
- `httpApi`: base URL desde `NEXT_PUBLIC_API_URL`, header `Authorization: Bearer <token>`, parseo del shape de error estándar, manejo de `total: null` en tablas masivas (el contrato lo contempla).

---

## 3. Fases

El detalle accionable de cada fase (con checkboxes) está en **`tasks/checklist.md`**. Resumen:

### Fase 0 — Reset y scaffold del proyecto base
Descartar el boilerplate de `app/`, montar la estructura Pages Router con el stack del ejemplo, portar los design tokens CSS, configurar env vars. **Criterio de hecho:** `npm run dev` levanta una página en blanco sin errores.

### Fase 1 — Capa de datos (el núcleo)
Construir `lib/api/` (types, client, mock, index), los JSON de `lib/mocks/`, los hooks de React Query y `lib/auth.ts`. **Criterio de hecho:** un hook de prueba (`useDashboardSummary`) devuelve datos tipados desde el JSON; cambiar `NEXT_PUBLIC_DATA_SOURCE=api` hace que intente el endpoint real (falla sin backend, pero demuestra el cableado).

### Fase 2 — Shell y UI compartida
Portar `Shell.jsx`, `lib/components.jsx`, configurar `_app.jsx` con `QueryClientProvider` + `AuthProvider`, route guard. **Criterio de hecho:** navegación entre rutas vacías funciona, sidebar/topbar pintan, login mockeado redirige.

### Fase 3 — Gráficas
Portar `lib/charts.jsx` — las 18 gráficas. Cada una recibe sus datos por **props tipadas**, nunca de un global. **Criterio de hecho:** las 18 gráficas renderizan en una página de prueba con datos de mock.

### Fase 4 — Pantallas (una por una)
Portar las 10+ screens del ejemplo, cableando cada una a sus hooks de React Query en vez de a `GSR_MOCKS`. Una subtarea por ruta. **Criterio de hecho:** cada ruta pinta con datos del JSON y tiene sus estados loading/empty/error.

### Fase 5 — Integración y verificación
Repaso de estados loading/empty/error en todas las vistas, verificación end-to-end en modo mock, verificación del switch a modo api, build de producción, ajuste del `Dockerfile` si hace falta. **Criterio de hecho:** `npm run build` pasa; demo navegable completa en modo mock; el switch a `api` está demostrado.

---

## 4. Riesgos y notas

- **Recharts 2.12 + React 18:** combinación probada en el ejemplo. No subir a React 19 (rompería compatibilidad de Recharts y obligaría a portar más).
- **`global.GSR_MOCKS`:** el ejemplo usa un hack `global.GSR_MOCKS = {...}` sobre `window`. **No portar ese patrón.** Los datos van por la capa `api` + hooks.
- **Mismatch ejemplo vs contrato:** el ejemplo tiene rutas como `/resolutions/[slug]` y el contrato habla de `questionId`; el ejemplo no tiene `/signals/[id]` como ruta. Alinear las rutas al contrato (ver checklist Fase 4).
- **Reshape de mocks:** es la tarea más tediosa y de más riesgo de Fase 1. Hacerla con cuidado, un endpoint a la vez, validando contra `API_CONTRACT.md`.
- **`total: null`:** el contrato permite que tablas masivas devuelvan `total: null` y solo `has_more`. El `DataTable` y la paginación deben soportarlo desde el principio.
