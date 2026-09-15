# Feature — Backend API (Millennium Falcon onboard computer)

> Part of: [../overview.md](../overview.md)
> Dependencies: [../architecture/odds-algorithm.md](../architecture/odds-algorithm.md)

## Purpose

HTTP service that loads the ship's configuration (`millennium-falcon.json` + SQLite routes) once at
startup, then serves odds-of-success computations for uploaded/POSTed Empire intelligence, and
serves the built frontend as static files in production.

## Public contract

| Endpoint | Inputs | Outputs | Errors |
|----------|--------|---------|--------|
| `GET /api/health` | none | `{ status: "ok" }` | none |
| `GET /api/mission` | none | `{ departure: string, arrival: string, autonomy: number }` | none |
| `POST /api/odds` | JSON body `EmpireConfig`-shaped (`{ countdown, bounty_hunters }`) **or** multipart form with a `file` field containing `empire.json` bytes | `{ odds: number, oddsPercent: number, reachable: boolean, minRiskEncounters: number \| null }` | `400 { error: string }` on malformed JSON, missing/invalid multipart file, or `InvalidConfigError` from parsing |

Startup config (env vars, all optional):

| Var | Default | Meaning |
|-----|---------|---------|
| `FALCON_CONFIG_PATH` | `millennium-falcon.json` (cwd-relative) | path to the ship config, resolved once at process start |
| `PORT` | `4000` | listen port |
| `HOST` | `0.0.0.0` | listen host |

## Behavior & algorithms

```
on startup:
  falconConfig = loadFalconConfig(FALCON_CONFIG_PATH)
  routes = loadRoutes(falconConfig.routesDb)
  graph = buildGraph(routes, [falconConfig.departure, falconConfig.arrival])
  staticRoot = resolve(__dirname, "../../web/dist")
  app = buildApp({ falconConfig, graph, staticRoot })
  app.listen({ port, host })

POST /api/odds(request):
  payload = request.isMultipart() ? parse uploaded file bytes as JSON : request.body
  empireConfig = parseEmpireConfig(payload)   # throws InvalidConfigError on bad shape
  result = computeOdds({ graph, autonomy: falconConfig.autonomy, departure, arrival,
                          countdown: empireConfig.countdown, bountyHunters: empireConfig.bountyHunters })
  respond { odds: result.odds, oddsPercent: round(result.odds * 100), reachable, minRiskEncounters }
```

The Falcon's own config (`millennium-falcon.json`) is loaded **once at process startup** and never
re-read per request — only `empire.json` varies per request, matching the README's description of
"when it starts, the back-end service will read a JSON configuration file...".

## Data & persistence touchpoints

Reads (read-only, at startup): `millennium-falcon.json`, the SQLite `routes` table via
`@falcon/core`'s `loadRoutes`. No writes, no request-scoped persistence.

## Error handling & edge cases

| Condition | Expected behavior |
|-----------|-------------------|
| Multipart request with no `file` field | `400 { error: "expected a multipart file field containing empire.json" }` |
| Uploaded file is not valid JSON | `400 { error: "uploaded file is not valid JSON: ..." }` |
| JSON body fails `EmpireConfig` validation (e.g. `countdown` not a number) | `400 { error: "\"countdown\" must be ..." }` |
| Startup config (`millennium-falcon.json` or routes DB) is invalid | process fails to start (fatal, not a request-time error) — matches CLI's fail-fast behavior |
| `packages/web/dist` does not exist (frontend not built yet) | static file serving is skipped (`existsSync` guard); API routes still work |

## Dependencies on other specs

- [../architecture/odds-algorithm.md](../architecture/odds-algorithm.md) — `computeOdds`, `buildGraph`.
- [../architecture/monorepo-tooling.md](../architecture/monorepo-tooling.md) — package boundaries.

## Acceptance criteria

- [x] `GET /api/mission` returns the loaded falcon config's departure/arrival/autonomy.
- [x] `POST /api/odds` with example2's `empire.json` as a JSON body returns `oddsPercent: 81`.
- [x] `POST /api/odds` with a real multipart file upload of example3's `empire.json` returns
      `oddsPercent: 90`.
- [x] `POST /api/odds` with a malformed payload (`countdown` not numeric) returns `400` with an
      `error` message mentioning `countdown`.
- [x] `POST /api/odds` for an unreachable mission (example1) returns `reachable: false`,
      `oddsPercent: 0`.

(Already implemented and verified — `packages/api/src/app.test.ts` (4 tests) plus live `curl` and
browser verification performed during initial build. No outstanding tasks for the currently
specified contract.)

## TODO(verify)

- [ ] No request size/rate limiting beyond the 5 MiB multipart file-size cap — acceptable for a
      technical-test scope; flag if production hardening is ever required.
