# GSR Market Intelligence

Plataforma de inteligencia de mercados de predicción (Polymarket) — terminal tipo Bloomberg para el escritorio de trading de GSR.

## ¿Qué hay aquí?

```
.
├── index.html          ← Demo navegable (abrir en cualquier navegador)
├── styles.css
├── mocks.js            ← Datos mock realistas (markets, resoluciones, signals, contratos, ecosistema)
├── components.jsx      ← UI compartida (KPI, DataTable, Pills, Tabs, Icon, formatters…)
├── charts.jsx          ← Recharts: PriceChart, VolumeBars, Orderbook, Calibration, Heatmap, etc.
├── screens.jsx         ← Las 10 pantallas
└── nextjs/             ← Estructura paralela lista para `next dev`
    ├── package.json
    ├── pages/          ← Pages Router (1 archivo por ruta)
    ├── components/Shell.jsx
    ├── screens/index.jsx
    ├── lib/{mocks,components,charts}.jsx
    └── styles/globals.css
```

## Demo HTML

Abre `index.html` directamente. Todo es client-side React + Recharts cargados desde CDN.
Rutas vía hash: `#/dashboard`, `#/markets`, `#/markets/trump-2028`, `#/resolutions`, `#/signals`, `#/ecosystem`, `#/login`, `#/settings`.

## Next.js (Pages Router)

```bash
cd nextjs
npm install
npm run dev
```

Rutas:

| URL | Pantalla |
|---|---|
| `/login` | Login |
| `/` | Dashboard |
| `/markets` | Lista de mercados |
| `/markets/[slug]` | Detalle de mercado |
| `/contracts` | Explorer (buscar contrato) |
| `/contracts/[address]` | Detalle de contrato |
| `/resolutions` | Watchdog de resoluciones UMA |
| `/resolutions/[slug]` | Detalle de resolución |
| `/signals` | Signals & divergencias |
| `/ecosystem` | Métricas agregadas Polymarket |
| `/settings` | Ajustes |

### Stack instalado
- Next.js 14 (Pages Router) + React 18
- Recharts 2.12 para gráficas
- lucide-react listo (los iconos actuales son inline SVG, fácil de migrar)
- Tailwind 3 configurado (las estilos viven en `styles/globals.css` como CSS tokenizado; Tailwind queda listo para añadir utilidades a medida que se itere)

### Migración a shadcn/ui
Los componentes (`Pill`, `StatusPill`, `Card`, `DataTable`, `TabBar`, etc.) están aislados en `lib/components.jsx`. Para sustituirlos por shadcn:
1. `npx shadcn-ui@latest init`
2. `npx shadcn-ui@latest add button card table tabs badge dialog input`
3. Reemplaza pieza por pieza dentro de `lib/components.jsx` manteniendo la API.

### Datos
Todos los mocks viven en `lib/mocks.js` (export default). Para conectar APIs reales:
- Reemplaza el objeto `GSR_MOCKS` por hooks (`useMarkets()`, `useResolution(slug)`) que llamen a tu backend.
- Las pantallas son agnósticas a la fuente: leen de `GSR_MOCKS.markets`, `GSR_MOCKS.resolutions`, etc.

## Notas de diseño

- **Solo dark mode.** Paleta basada en `var(--bg-base)` (#0B0D10) con acento azul (#4F8CFF) + semánticos (verde YES, rojo NO, ámbar warning).
- **Mono para números/addresses.** JetBrains Mono. Texto en Inter.
- **Live ticks** simulados en Dashboard y Market Detail (precios parpadeando cada 2–4 s).
- **18 gráficas** del catálogo implementadas con Recharts + algunas SVG custom (timeline de resolución, holders bar, sev-meter, heatmap).

## Próximos pasos sugeridos

1. Conectar WebSocket real de Polymarket (`wss://...`) para los `useFlash` ticks.
2. Sustituir `Icon` inline por `lucide-react` (mismas keys, paquete ya instalado).
3. Migrar `DataTable` a `@tanstack/react-table` para virtualización en >1k filas.
4. Auth: el flujo del Login está mockeado — atar a NextAuth o tu IdP.
