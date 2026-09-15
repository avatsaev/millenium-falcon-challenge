# Task 005 — Backend API (Millennium Falcon onboard computer)

- **Sprint:** sprint-001-core-and-deliverables
- **Status:** done
- **Type:** feature
- **Area:** packages/api
- **Priority:** P1
- **Estimated size:** M
- **Depends on:** task-003

## Goal
Ship the mandatory backend deliverable: load the ship config once at startup, serve odds for POSTed
or uploaded Empire intelligence, and serve the built SPA in production.

## Context / why
The README: "When it starts, the back-end service will read a JSON configuration file..." — so the
falcon config and routes graph are startup state, not per-request work. Only `empire.json` varies per
request.

## Scope references
- `swe/specs/features/backend-api.md` § Public contract, § Behavior & algorithms, § Error handling
- `packages/api/src/app.ts`, `packages/api/src/server.ts`, `packages/api/src/app.test.ts`

## What to build
- `buildApp({ falconConfig, graph, staticRoot?, logger? }): Promise<FastifyInstance>` — register
  `@fastify/cors`, `@fastify/multipart` (5 MiB cap), and `@fastify/static` only when `staticRoot`
  exists; routes:
  - `GET /api/health` -> `{ status: "ok" }`
  - `GET /api/mission` -> `{ departure, arrival, autonomy }`
  - `POST /api/odds` -> accepts a JSON body **or** a multipart `file` field; responds
    `{ odds, oddsPercent, reachable, minRiskEncounters }`; `InvalidConfigError` -> `400 { error }`.
- `server.ts`: read `FALCON_CONFIG_PATH`/`PORT`/`HOST`, load config + routes + graph once, resolve
  `staticRoot` to `packages/web/dist`, listen; fatal on bad startup config.

## Out of scope
Auth, rate limiting beyond the multipart size cap, request persistence, deployment.

## Acceptance criteria
- [x] `GET /api/mission` returns the startup-loaded departure/arrival/autonomy.
- [x] `POST /api/odds` with example2's JSON body -> `oddsPercent: 81`, `odds: 0.81`.
- [x] `POST /api/odds` with a real multipart upload of example3's file -> `oddsPercent: 90`.
- [x] `POST /api/odds` for example1 -> `reachable: false`, `oddsPercent: 0`.
- [x] Malformed payload (`countdown` non-numeric) -> `400` with an `error` mentioning `countdown`.

## Test / verification plan
- Tests: `packages/api/src/app.test.ts` via `app.inject` — 4 tests; `pnpm --filter @falcon/api run test`.
- Manual: start `node packages/api/dist/server.js` with `FALCON_CONFIG_PATH=examples/example2/...` and
  exercise all four cases with `curl` (including a real `-F file=@...` upload).

## Notes
Static serving is guarded by `existsSync` so the API runs before the frontend is ever built.
