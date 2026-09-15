# Millennium Falcon Challenge — Overview

> Source of truth for what this effort is and how it fits together. Sub-specs describe the details;
> this file ties them together and indexes them.

## Purpose & scope

Implements the Dataiku "What are the odds?" technical test: given the Millennium Falcon's onboard
configuration (autonomy, departure/arrival planets, a routes database) and intercepted Empire
intelligence (countdown, bounty hunter sightings), compute the probability that the Falcon reaches
the arrival planet before the countdown expires while minimizing exposure to bounty hunters.

Three mandatory deliverables, per `README.md`:
- **Backend** ("Millennium Falcon onboard computer") — reads `millennium-falcon.json` + a SQLite
  routes database at startup, exposes odds computation over HTTP.
- **Frontend** ("C3PO") — single-page app; user uploads `empire.json`, sees odds as a percentage.
- **CLI** ("R2D2", `give-me-the-odds`) — takes both config file paths as argv, prints a plain
  0–100 integer, independent of the backend/frontend.

Out of scope: authentication, multi-tenant configuration, persistence of past queries, deployment
automation.

## Tech stack & runtime requirements

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict), Node.js ≥ 20, ESM throughout — `packages/web` on TypeScript 7 (native compiler), the Node packages on TypeScript 5.7 |
| Monorepo / package manager | pnpm workspaces (`pnpm-workspace.yaml`) |
| Backend framework | Fastify 5 (`@fastify/cors`, `@fastify/multipart`, `@fastify/static`) |
| Frontend framework | React 19 + Vite 6, styled with Tailwind CSS 4 (`@tailwindcss/vite`) — no hand-written component CSS |
| Frontend icons | `lucide-react` 1.x (MIT, tree-shaken per named import) — the only icon source; no inline SVG, no icon fonts |
| Frontend data fetching | TanStack Query 5 (`@tanstack/react-query`) — owns all API state; components hold no hand-rolled loading/error state |
| CLI | Plain Node ESM entrypoint, no framework |
| Persistence | SQLite routes DB via `better-sqlite3` (native binding, read-only) |
| Build | `tsup` (Node packages: core/api/cli), `vite build` (web) |
| Test | Vitest (all four packages); Fastify `app.inject` for API; Testing Library + jsdom for web |

## High-level architecture

```
                        ┌──────────────────────────┐
                        │      packages/core       │
                        │  (types, graph, DP odds  │
                        │   algorithm, config &    │
                        │   SQLite loaders)        │
                        └────────────┬─────────────┘
                   ┌─────────────────┼──────────────────┐
                   ▼                 ▼                  ▼
          ┌─────────────────┐ ┌─────────────────┐ ┌───────────────────┐
          │  packages/api   │ │  packages/cli   │ │   packages/web    │
          │ Fastify server  │ │ give-me-the-odds│ │ React SPA (C3PO)  │
          │ GET /api/mission│ │ argv → stdout   │ │ upload → fetch    │
          │ POST /api/odds  │ │ (0-100 integer) │ │ /api/odds → %     │
          └─────────────────┘ └─────────────────┘ └───────────────────┘
                   ▲                                        │
                   └──────────────── dev proxy ─────────────┘
```

All four workspace members live in a single flat `packages/*` tier: `packages/core` is the only
library, the other three are runnable deliverables that depend on it.

`packages/cli` calls `@falcon/core` directly — it never talks to `packages/api`. `packages/web` talks
only to `packages/api` over HTTP (dev: Vite proxy on `/api`; prod: Fastify serves the built SPA as
static files from `packages/web/dist`).

## Module / directory map

| Path | Responsibility |
|------|----------------|
| `packages/core/src/types.ts` | Domain types: `FalconConfig`, `Route`, `BountyHunterSighting`, `EmpireConfig`, `OddsResult` |
| `packages/core/src/guards.ts` | Shared `isRecord` type guard for narrowing unknown JSON |
| `packages/core/src/errors.ts` | `InvalidConfigError` — thrown on any malformed config/db input |
| `packages/core/src/config.ts` | Loads/validates `millennium-falcon.json` and `empire.json` (`loadFalconConfig`, `loadEmpireConfig`, `parseEmpireConfig`) |
| `packages/core/src/routes-db.ts` | `loadRoutes(dbPath)` — reads the `routes` table from SQLite |
| `packages/core/src/graph.ts` | `buildGraph(routes, extraPlanets)` — undirected planet adjacency graph |
| `packages/core/src/odds.ts` | `computeOdds(params)` — the core DP algorithm |
| `packages/core/src/index.ts` | Public barrel export |
| `packages/api/src/app.ts` | `buildApp(options)` — Fastify instance factory, routes |
| `packages/api/src/server.ts` | Process entrypoint — reads env, loads config once at startup, listens |
| `packages/cli/src/run.ts` | `computeOddsPercent(falconPath, empirePath)` — shared CLI logic |
| `packages/cli/src/cli.ts` | `give-me-the-odds` process entrypoint (argv → stdout/stderr/exit code) |
| `packages/web/src/api.ts` | Typed `fetch` client: `fetchMission`, `fetchOdds` |
| `packages/web/src/App.tsx` | Root React component: mission banner, upload control, odds display |
| `packages/web/src/main.tsx` | React DOM mount |
| `examples/example{1..4}/` | Fixture configs + `answer.json` — the ground truth used by all algorithm tests |

## Data model overview

- **`FalconConfig`**: `autonomy` (int days), `departure`/`arrival` (planet names), `routesDb`
  (absolute path, resolved from `millennium-falcon.json`'s `routes_db` field relative to the config
  file's own directory).
- **`Route`**: `origin`, `destination` (planet names), `travelTime` (positive int days). Travelable
  in either direction (undirected edge).
- **`EmpireConfig`**: `countdown` (int days), `bountyHunters: BountyHunterSighting[]` (each a
  `{ planet, day }` pair; duplicates on the same planet/day collapse to one risk trial).
- **`OddsResult`**: `{ odds: number (0..1), reachable: boolean, minRiskEncounters: number | null }`.

Full algorithm contract: [architecture/odds-algorithm.md](architecture/odds-algorithm.md).

## External integrations & configuration

| Name | Kind | Used by | Notes |
|------|------|---------|-------|
| `millennium-falcon.json` | input file | API (startup), CLI (argv) | `{ autonomy, departure, arrival, routes_db }` |
| `empire.json` | input file / upload | CLI (argv), Web (file upload) | `{ countdown, bounty_hunters: [{planet, day}] }` |
| SQLite `routes` table | database | API, CLI (via `@falcon/core`) | columns `origin`/`destination`/`travel_time`, case-insensitive |
| `FALCON_CONFIG_PATH` | env var | `packages/api/src/server.ts` | path to `millennium-falcon.json`; default `millennium-falcon.json` (cwd-relative) |
| `PORT` | env var | `packages/api/src/server.ts` | HTTP port; default `4000` |
| `HOST` | env var | `packages/api/src/server.ts` | bind host; default `0.0.0.0` |
| `VITE_API_PROXY_TARGET` | env var | `packages/web/vite.config.ts` | dev-only proxy target for `/api`; default `http://localhost:4000` |

## Build / run / test / deploy overview

- Install: `pnpm install` (root).
- Build everything: `pnpm run build` (builds `packages/core` first via workspace dependency order,
  then `packages/api`, `packages/cli`, `packages/web`).
- Typecheck / lint: `pnpm run typecheck` / `pnpm run lint` (lint is currently `tsc --noEmit` per
  package — no dedicated linter installed yet).
- Test: `pnpm run test` (Vitest per package).
- Run API: `pnpm --filter @falcon/api run dev` (tsx watch) or `node packages/api/dist/server.js` after
  build.
- Run web: `pnpm --filter @falcon/web run dev` (Vite dev server, port 5173, proxies `/api`).
- Run CLI: `node packages/cli/dist/cli.js <millennium-falcon.json> <empire.json>` after build (or wire a
  `bin` symlink via `pnpm link`).
- Deploy: not yet specified — no Dockerfile/CI config exists yet (tracked as a gap below).

## Sub-spec index

| File | Kind | Description |
|------|------|-------------|
| [architecture/odds-algorithm.md](architecture/odds-algorithm.md) | architecture | The DP odds-of-success algorithm shared by API and CLI |
| [architecture/monorepo-tooling.md](architecture/monorepo-tooling.md) | architecture | pnpm workspace layout, build/test tooling, package boundaries |
| [features/backend-api.md](features/backend-api.md) | feature | Fastify HTTP API (`/api/mission`, `/api/odds`) |
| [features/cli-r2d2.md](features/cli-r2d2.md) | feature | `give-me-the-odds` CLI |
| [features/frontend-c3po.md](features/frontend-c3po.md) | feature | React SPA upload/display UI |

## Open questions — TODO(verify)

- [ ] No `Dockerfile`/CI workflow exists yet — deployment story is unspecified. Flag if a submission
      needs one.
- [ ] No lint tool (ESLint/Biome) is installed; `lint` scripts currently alias `tsc --noEmit`. Decide
      whether a real linter is worth adding before submission.
- [ ] No root-level `millennium-falcon.json`/`universe.db` exists outside `examples/*` — API/CLI
      always need an explicit path today. Decide if a default top-level config should ship.
- [ ] AI-tool-usage disclosure required by `README.md` is not yet written anywhere in the repo.
