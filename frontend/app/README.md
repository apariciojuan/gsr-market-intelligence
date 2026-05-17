# GSR Market Intelligence — Frontend

Prediction-markets intelligence terminal for the Polymarket ecosystem.
Next.js 14 (Pages Router), React 18, React Query, Recharts, Tailwind 3.

The app ships with a complete **mock data layer** so it runs and demos
end-to-end with zero backend. Switching to the real API is a single
environment variable — no code changes.

---

## Running the project

Requires Node.js 20+ (the Docker image pins 22.18).

```bash
cd app
npm install
npm run dev
```

The app starts on <http://localhost:3000>. Other scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build (`next build`) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (`next/core-web-vitals`) |

### Demo credentials

In mock mode, log in at `/login` with:

```
username: admin
password: 1234
```

These are the fixed mock user defined in `lib/mocks/auth.json`. The login
screen shows them as a hint. Bad credentials return a typed
`LOGIN_BAD_CREDENTIALS` error, exactly like the real backend would.

---

## The two data sources

Every screen reads data through React Query hooks (`lib/hooks/*`), which
call a single typed API interface (`GsrApi`). That interface has **two
interchangeable implementations**:

| `NEXT_PUBLIC_DATA_SOURCE` | Implementation | Data comes from |
|---|---|---|
| `mock` (default) | `mockApi` (`lib/api/mock.ts`) | JSON fixtures in `lib/mocks/` |
| `api` | `httpApi` (`lib/api/client.ts`) | HTTP calls to `NEXT_PUBLIC_API_URL` |

The switch lives in `lib/api/index.ts`:

```ts
const USE_MOCK = process.env.NEXT_PUBLIC_DATA_SOURCE !== "api";
export const api: GsrApi = USE_MOCK ? mockApi : httpApi;
```

Both implementations satisfy the **same** `GsrApi` interface (same method
signatures, same return types, same error shape — a typed `ApiError` with
`{ detail, code, field }`). `mockApi` even reproduces the contract's
runtime semantics: ~200 ms latency, `limit`/`offset`/`order`/`order_by`
pagination, `{ items, total, has_more }` envelopes, and 404s for unknown
slugs/ids/addresses.

**No component, hook, or screen knows where the data comes from.** They
only ever touch `api.<domain>.<method>()`.

Environment variables (`.env.local`, see `.env.example`):

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000   # backend base URL (used in api mode)
NEXT_PUBLIC_DATA_SOURCE=mock                # mock | api
```

---

## Folder structure

```
app/
├── pages/                  # Pages Router — one file per route
│   ├── _app.jsx            # QueryClientProvider + AuthProvider + ToastHost
│   ├── login.jsx
│   ├── index.jsx           # Dashboard
│   ├── markets/            # index + [slug]
│   ├── contracts/          # index + [address]
│   ├── resolutions/        # index + [questionId]
│   ├── signals/            # index + [id]
│   ├── ecosystem.jsx
│   └── settings.jsx
├── components/
│   └── Shell.jsx           # sidebar + topbar + route guard
├── screens/                # the 13 screen components (one per route)
├── styles/
│   └── globals.css         # design tokens + base styles
├── lib/
│   ├── api/                # ── the data layer ──
│   │   ├── types.ts        # TS types for all 35 endpoints (from API_CONTRACT.md)
│   │   ├── interface.ts    # the GsrApi interface
│   │   ├── client.ts       # httpApi — real fetch wrapper (base URL, JWT, errors)
│   │   ├── mock.ts         # mockApi — JSON-backed, contract-faithful
│   │   ├── error.ts        # ApiError
│   │   ├── token.ts        # JWT localStorage primitive
│   │   └── index.ts        # ◄── THE SWITCH (mock vs api)
│   ├── hooks/              # React Query hooks, one module per domain
│   ├── mocks/              # JSON fixtures, exact shape of API_CONTRACT.md
│   ├── auth.ts             # login flow, token storage, useAuth() / AuthProvider
│   ├── queryClient.ts      # QueryClient instance
│   ├── components.jsx      # shared UI (formatters, Icon, KpiCard, DataTable, …)
│   └── charts.jsx          # the 18 charts (G1–G18), all props-driven & typed
└── scripts/
    └── gen-mocks.js        # regenerates lib/mocks/*.json deterministically
```

Data flow: **screen → React Query hook → `api.<domain>.<method>()` →
`mockApi` or `httpApi`**. The arrows never skip a layer.

---

## Going to production

To point the app at the real backend instead of the JSON fixtures:

1. In `app/.env.local`, set:
   ```
   NEXT_PUBLIC_DATA_SOURCE=api
   NEXT_PUBLIC_API_URL=https://your-backend-host        # e.g. https://gsr-mi.example.com/api
   ```
2. Restart the dev server (or rebuild — `NEXT_PUBLIC_*` vars are inlined at
   build time).

That's the entire migration. The moment `NEXT_PUBLIC_DATA_SOURCE=api`:

- `lib/api/index.ts` resolves `api` to **`httpApi`** instead of `mockApi`.
- Every hook now issues real HTTP requests to `NEXT_PUBLIC_API_URL` with
  the contract paths (`GET /dashboard/summary`, `GET /markets/{slug}`,
  `POST /auth/jwt/login`, …) and an `Authorization: Bearer <token>` header.
- The JSON files in `lib/mocks/` become **inert** — nothing imports them
  anymore; `httpApi` never touches them. They can stay in the repo as
  reference fixtures or be removed.
- No component, hook, or screen changes. The loading / empty / error
  states already wired for the mock layer work identically against the
  live API, because both implementations throw the same typed `ApiError`.

If the backend is unreachable, screens render their **error state**
(not a crash): `httpApi` surfaces network failures as
`ApiError(0, { code: "NETWORK_ERROR" })`, and HTTP error bodies as
`ApiError(status, { detail, code, field })`.

---

## Docker

The repo root has a `Dockerfile` that copies `app/` and runs `npm run dev`:

```bash
# from the repo root (the build context must include app/)
docker build -t gsr-frontend .
docker run -p 3000:3000 gsr-frontend
```

`next dev` binds `0.0.0.0` by default, so the container is reachable on
`http://localhost:3000`. The root `.dockerignore` keeps host-built
artifacts (`app/node_modules`, `app/.next`) out of the build context so
the image installs its own dependencies cleanly.
