# `@falcon/api` — Millennium Falcon onboard computer (HTTP)

Fastify 5 service that loads the ship's config once at boot and answers odds requests using
`@falcon/core`; it owns no algorithm. It also serves the built SPA from `packages/web/dist` when that
exists, so the submission runs as one process on one URL. Consumers: `packages/web` (via `src/api/client.ts`)
and any reviewer with `curl`. Workspace-wide rules live in [../../AGENTS.md](../../AGENTS.md).

## Commands

| Command | Effect |
|---------|--------|
| `pnpm --filter @falcon/api run dev` | `tsx watch src/server.ts` — reads `./millennium-falcon.json` from the **cwd** |
| `pnpm --filter @falcon/api run build` | `tsup` → `dist/server.js` (ESM, node24, `better-sqlite3` external) |
| `pnpm --filter @falcon/api run start` | `node dist/server.js` (needs `run build` first) |
| `pnpm --filter @falcon/api run test` | `vitest run` — `src/**/*.test.ts`, node environment |
| `pnpm --filter @falcon/api run typecheck` | `tsc --noEmit` (TS 5.7). Lint from the root (`pnpm run lint`) — ESLint is one workspace-wide process |

Env, read only in `src/server.ts`: `FALCON_CONFIG_PATH` (default `millennium-falcon.json`, `resolve`d
against cwd), `PORT` (default `4000`), `HOST` (default `0.0.0.0`).

## Layout

| File | Role |
|------|------|
| `src/app.ts` | `buildApp(options)` — the whole HTTP surface; pure function of injected config/graph |
| `src/server.ts` | Entry: env → `loadFalconConfig`/`loadRoutes`/`buildGraph` → `staticRoot` → `listen` |
| `src/app.test.ts` | Only test file; 8 `it` blocks driven by `app.inject` and `examples/*` fixtures, each booting through the local `startApp(fixture)` helper (which also registers the instance for `afterEach` teardown) |
| `Dockerfile` | Multi-stage image; **build context is the repo root**, not this directory. Stages: `manifests` (package.json + lockfile only) → `toolchain` (python3/make/g++ for the native addon) → `build` / `prod-deps` → `runtime`. Runs as `node`, `HEALTHCHECK` hits `GET /api/health`, universe mounted at `/config` |

## Contracts and invariants

- Boot-scoped vs request-scoped: `falconConfig`, the routes DB and `graph` load **once** in `main()`
  and are captured by the handler closures; only `empire.json` varies per request. Never re-read the
  config or reopen SQLite in a handler. Startup failure is fatal: `main().catch` prints
  `error.stack ?? error.message`, sets `process.exitCode = 1`; core raises a typed
  `InvalidConfigError` — never downgrade a bad startup config into a request-time error.
- `GET /api/universe` → `200 { departure, arrival, autonomy, planets, routes }` with `routes` as
  `{ origin, destination, travelTime }[]`. Constant for the process lifetime.
- `POST /api/odds` takes **either** a JSON body (`{ countdown, bounty_hunters }`) **or** a real
  `multipart/form-data` upload (`request.file()` takes the first file field). `200` has exactly eight
  fields: `odds`, `oddsPercent`, `reachable`, `minRiskEncounters`, `arrivalDay`, `countdown`,
  `bountyHunters`, `itinerary` — all mirrored by `packages/web/src/api/types.ts`'s `OddsResponse`, which an
  added field must join in the same change, plus the spec table.
- `400 { error: string }` is the only failure shape, raised solely from `InvalidConfigError`: missing
  multipart file, uploaded bytes not JSON, or `parseEmpireConfig` rejection. Anything else rethrows.
- `GET /api/mission` was removed outright — no alias, no redirect, `404` asserted by a test; do not
  reintroduce it. `graph.adjacency` is deliberately never serialised.
- The two success shapes and the failure shape are **declared** in `src/app.ts` (`UniverseResponse`,
  `OddsResponse`, `ErrorResponse`) and every handler's payload is checked with `satisfies` at the
  `reply.send()` / return site, so a typo or a dropped field is a compile error rather than a runtime
  surprise. `app.test.ts` reads bodies as `response.json<UniverseResponse>()` etc. for the same reason.
  These are the API's own wire types; `packages/web/src/api/types.ts` declares its mirror independently
  (no cross-package import — the web client must keep working against a deployed API).
- Route order is deterministic: each edge kept once (`edge.to <= planetIdx` skip),
  `[origin, destination]` normalised lexicographically, then sorted `(origin asc, destination asc)`.
  Sightings are echoed via `dedupeSightings` (one per `{planet, day}`, `(day, planet)` asc) — the same
  canonical schedule fed to `computeOdds`.
- `oddsPercent` is `Math.round(result.odds * 100)`; `odds` stays the raw `0..1` float. The README's
  display value is that rounded percent, never re-rounded on the client.

## Conventions

- `buildApp` is the testable unit and takes everything injected (`falconConfig`, `graph`, optional
  `staticRoot`/`logger`, the latter defaulting to `true`). No `process.env`, no config `fs` reads, no
  `import.meta.url` path math inside it — that is `server.ts`'s job.
- Error handling: `instanceof InvalidConfigError` → `reply.code(400)`, else rethrow — no catch-all.
- Static serving is conditional on `staticRoot && existsSync(staticRoot)` (`server.ts` resolves
  `../../web/dist`). Plugins: cors `origin: true`, multipart `fileSize` 5 MiB, then static.

## Testing

`src/app.test.ts` builds fixtures with `loadFixture(name)` (`loadFalconConfig` + `loadRoutes` +
`buildGraph` over `examples/<name>/`), then `buildApp({ ..., logger: false })` + `app.inject` — no
sockets, no ports; `afterEach` closes the app. Tests and what they pin:

| Test | Pins |
|------|------|
| `GET /api/universe returns the fixture's planets, routes and startup mission fields` | 4 planets, 5 sorted routes, two injects returning equal `routes` |
| `GET /api/mission is gone -- no alias or redirect` | `404` |
| `GET /api/health reports liveness` | `200 { status: "ok" }` |
| `POST /api/odds computes odds from a JSON body, matching example2/answer.json` | `oddsPercent` 81, `arrivalDay`/`countdown` 8, 4-step itinerary, 3 echoed sightings |
| `POST /api/odds accepts a real multipart upload, matching example3/answer.json` | hand-built boundary body → `oddsPercent` 90; the only proof the browser `FormData` path works |
| `POST /api/odds returns 0% when the destination is unreachable in time (example1)` | `reachable: false`, `itinerary`/`arrivalDay` `null` |
| `collapses duplicate {planet, day} sightings in the echoed bountyHunters` | the `dedupeSightings` echo |
| `POST /api/odds returns 400 for a malformed empire.json payload` | `error` matches `/countdown/` |

Assert observable HTTP behaviour — status codes and response fields — with expected odds taken from
`examples/*/answer.json` (example1 → 0, example2 → 81, example3 → 90). Never copy a literal you
computed yourself, nor assert log output or handler wiring.

## Traps

- The port is **4000**, not 3000. `packages/web/vite.config.ts` proxies `/api` to
  `http://localhost:4000`; changing `PORT` without `VITE_API_PROXY_TARGET` breaks `dev:web`.
- `dev`/`start` resolve the config against **cwd**: from the repo root, set `FALCON_CONFIG_PATH`.
- Static serving vanishes when `packages/web/dist` is absent — build `web` before claiming the SPA is
  served. `@fastify/static` gets `{ root }` only: no history fallback, so a deep link would 404.
- A file over the 5 MiB `fileSize` limit throws inside `file.toBuffer()`, which is **not** an
  `InvalidConfigError`, so it escapes to Fastify's default handler (413) rather than the documented
  `400 { error }`. Untested; do not assume the 400 shape covers it.
- `cors: { origin: true }` reflects any origin — dev convenience for the Vite server, not a policy.
- Non-multipart requests are handed to `parseEmpireConfig` as `request.body` verbatim; a bodyless POST
  therefore fails validation as `400`, not as a dedicated "missing payload" branch.
- `undirectedRoutes` drops self-loops (`origin === destination` gives `edge.to === planetIdx`) and
  emits duplicate rows for duplicated SQLite routes; neither case exists in `examples/`.
- New endpoints need the spec (`swe/specs/features/backend-api.md`) and the web client updated too.
- In the image, `packages/web/dist` is deliberately absent — nginx serves the SPA there, so `staticRoot`
  is skipped and `GET /` is a 404 from inside the api container. That is expected; check `:8080`, not `:4000`.
- `HEALTHCHECK` must use the **exec form**. The shell form dies on `${process.env.PORT}` with
  `/bin/sh: Bad substitution` — the probe fails, and compose then refuses to start `web`.
- A crash with only a native stack and no JS output usually means the process aborted before Node could
  flush a piped stderr. Re-run with `docker run -t` (a TTY makes stderr synchronous) or write breadcrumbs
  with `fs.writeSync(2, …)`; `console.error` output is lost on `SIGABRT`.

## Specs

Governed by [`swe/specs/features/backend-api.md`](../../swe/specs/features/backend-api.md) — §Public
contract, §Behavior & algorithms, §Error handling & edge cases. Payload changes must also update
[`swe/specs/features/universe-map.md`](../../swe/specs/features/universe-map.md), sole consumer of
`planets`/`routes`/`itinerary`; algorithm:
[`swe/specs/architecture/odds-algorithm.md`](../../swe/specs/architecture/odds-algorithm.md).
