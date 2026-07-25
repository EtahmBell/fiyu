# Fiyu frontend

Tokyo restaurant discovery UI for the Fiyu backend. Next.js 16 (App Router),
TypeScript, Tailwind CSS v4, Zod runtime validation.

**Current state: Phases 1–2 of 6.** The API contract layer and design system are
complete. The restaurant list, filters, map and detail sheet are not built yet —
see [Roadmap](#roadmap).

## Prerequisites

- Node.js 20+ (developed on 24.18.0)
- The Fiyu backend running on `http://127.0.0.1:8000`

## Running locally

### 1. Start the backend

From the repository root, in a separate terminal:

```powershell
cd fiyu-backend
.venv\Scripts\Activate.ps1
uvicorn fiyu.api:app --reload --port 8000
```

Confirm it is up: <http://127.0.0.1:8000/health>

### 2. Configure the frontend

```bash
cd fiyu-frontend
cp .env.example .env.local
```

`.env.local` is git-ignored. Edit it if your backend is not on the default
address, and add a Google Maps browser key when you have one.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIYU_API_URL` | No (defaults to `http://127.0.0.1:8000`) | Backend base URL |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | No | Browser map. Without it the UI shows a documented placeholder and stays fully usable. |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | No | Map styling and Advanced Markers (Phase 4) |

Every variable is `NEXT_PUBLIC_`, meaning it is inlined into the browser bundle.
Never put a secret in this file. In particular `GOOGLE_PLACES_SERVER_KEY` is a
backend-only secret — the frontend never calls the Google Places Web Service.

### 3. Start the dev server

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

**Port 3000 is required.** The backend's CORS allowlist is
`http://localhost:3000` and `http://127.0.0.1:3000` only. Override it with
`FIYU_CORS_ORIGINS` on the backend if you need a different port.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (pure logic) |
| `npm run test:watch` | Vitest in watch mode |

## Architecture

```
src/
├── app/          routing and server-side data loading only
├── components/   presentation; never fetches
│   ├── ui/       primitives with no domain knowledge
│   └── map/      map surface and its fallbacks
├── lib/
│   ├── api/      the ONLY module that performs network I/O
│   ├── config/   environment access
│   ├── format/   raw API values → display-safe output
│   └── utils/
└── test/fixtures/  unmodified responses captured from the live backend
```

### Data flow

The catalog is fetched in a Server Component with a 300-second revalidation
window. Google live details are fetched **only when a user opens a restaurant** —
never while rendering a list. Each live-details call is a billed, uncached
Google Places request on the backend.

Every response is validated with Zod before it reaches a component. Failures are
normalised into a `FiyuApiError` carrying a `kind` (`not-found`,
`provider-timeout`, `backend-unavailable`, `offline`, …) so the UI branches on
intent rather than on status codes.

### Design system

One warm light palette, one accent (muted persimmon), three typefaces:
Instrument Serif for display, Inter for UI, Noto Sans JP for Japanese. Japanese
typography is applied by attribute — tagging a run `lang="ja"` is enough to get
the right font, `line-break: strict` and `palt` spacing. There is no dark theme
in this version.

## Backend limitations

Several product requirements are constrained by what the API exposes — most
importantly, **there is no popularity data in the catalog**, so the "Hidden Gems
→ Popular Favorites" control cannot be backed by real popularity.

Read [docs/LIMITATIONS.md](./docs/LIMITATIONS.md) before building on this, and
[docs/BACKEND-REQUESTS.md](./docs/BACKEND-REQUESTS.md) for the proposed fix.

## Roadmap

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Scaffold, Zod schemas, typed API client, error model, fixtures, tests | Done |
| 2 | Design tokens, fonts, UI primitives, map placeholder | Done |
| 3 | Restaurant list and cards, list-level states | Not started |
| 4 | Google map, markers, mobile toggle, desktop split | Not started |
| 5 | Detail route + intercepting sheet, live-details fetching | Not started |
| 6 | Ward and cuisine filters, discovery slider | Not started |
