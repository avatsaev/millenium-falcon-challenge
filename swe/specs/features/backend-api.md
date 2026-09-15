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
| `GET /api/universe` | none | `{ departure, arrival, autonomy, planets: string[], routes: { origin, destination, travelTime }[] }` | none |
| `POST /api/odds` | JSON body `EmpireConfig`-shaped (`{ countdown, bounty_hunters }`) **or** multipart form with a `file` field containing `empire.json` bytes | `{ odds, oddsPercent, reachable, minRiskEncounters, arrivalDay, countdown, bountyHunters, itinerary }` | `400 { error: string }` on malformed JSON, missing/invalid multipart file, or `InvalidConfigError` from parsing |

`GET /api/mission` is **removed** — `GET /api/universe` is a strict superset of it (same three fields
plus the graph), so the frontend needs one request and one query key instead of two. Clean cutover: no
alias, no redirect.

`POST /api/odds` response fields:

| Field | Type | Meaning |
|-------|------|---------|
| `odds` | `number` | probability of success, `0..1` |
| `oddsPercent` | `number` | `round(odds * 100)` — the README's display value |
| `reachable` | `boolean` | whether arrival before the countdown is possible at all |
| `minRiskEncounters` | `number \| null` | bounty-hunter exposure on the best route; `null` when unreachable |
| `arrivalDay` | `number \| null` | day the Falcon lands on the arrival planet; `null` when unreachable |
| `countdown` | `number` | echoed from the validated upload, so the details list can show the deadline without re-parsing the file |
| `bountyHunters` | `{ planet, day }[]` | echoed, `dedupeSightings`-normalised (one entry per planet-day, sorted by `(day, planet)`) |
| `itinerary` | `ItineraryStep[] \| null` | the canonical plan; `null` when unreachable |

The intel is echoed back rather than re-parsed in the browser: the server has already validated and
normalised it, so echoing keeps a single source of truth for what "the schedule" is. `itinerary` and
`arrivalDay` come straight from `computeOdds` (see
[../architecture/odds-algorithm.md](../architecture/odds-algorithm.md) §Itinerary reconstruction).

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

GET /api/universe:
  respond { departure, arrival, autonomy } from falconConfig
        + { planets: graph.planets, routes: undirectedRoutes(graph) }   # graph captured at startup

POST /api/odds(request):
  payload = request.isMultipart() ? parse uploaded file bytes as JSON : request.body
  empireConfig = parseEmpireConfig(payload)   # throws InvalidConfigError on bad shape
  result = computeOdds({ graph, autonomy: falconConfig.autonomy, departure, arrival,
                          countdown: empireConfig.countdown, bountyHunters: empireConfig.bountyHunters })
  respond { odds, oddsPercent: round(odds * 100), reachable, minRiskEncounters,
            arrivalDay, itinerary,
            countdown: empireConfig.countdown,
            bountyHunters: dedupeSightings(empireConfig.bountyHunters) }
```

`BuildAppOptions` is `{ falconConfig, graph, staticRoot?, logger? }`. The route rows in the response are
derived from the graph by the local `undirectedRoutes(graph)` helper rather than passed in beside it:
the graph is the thing the DP actually runs on, so deriving keeps one source of truth (a `routes` array
and a `graph` built from it can drift), and the helper sorts by `(origin, destination)` so the payload is
deterministic regardless of insertion order — which the API tests pin. The cost is one pass over the
adjacency per request on a 4-planet graph.

The Falcon's own config (`millennium-falcon.json`) is loaded **once at process startup** and never
re-read per request — only `empire.json` varies per request, matching the README's description of
"when it starts, the back-end service will read a JSON configuration file...". `GET /api/universe` is
therefore constant for the lifetime of the process, and the frontend caches it accordingly.

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
| Unreachable mission | `200` with `reachable: false`, `oddsPercent: 0`, `itinerary: null`, `arrivalDay: null` — not an error |
| Isolated departure/arrival (no routes reference them) | present in `planets` (forced in by `buildGraph`) with no incident routes |
| Sighting on a planet absent from the routes table | echoed in `bountyHunters` unchanged; the frontend is responsible for not drawing a phantom node |

## Dependencies on other specs

- [../architecture/odds-algorithm.md](../architecture/odds-algorithm.md) — `computeOdds`, `buildGraph`.
- [../architecture/monorepo-tooling.md](../architecture/monorepo-tooling.md) — package boundaries.
- [universe-map.md](universe-map.md) — the sole consumer of `planets`/`routes`/`itinerary`;
  any change to those payloads must update both specs together.

## Acceptance criteria

- [x] `GET /api/universe` returns the loaded falcon config's departure/arrival/autonomy **plus** the
      fixture universe's 4 planets and 5 routes with their travel times.
- [x] `GET /api/mission` no longer exists (`404`), and no test or client references it.
- [x] `POST /api/odds` with example2's `empire.json` as a JSON body returns `oddsPercent: 81`.
- [x] `POST /api/odds` with a real multipart file upload of example3's `empire.json` returns
      `oddsPercent: 90`.
- [x] `POST /api/odds` with a malformed payload (`countdown` not numeric) returns `400` with an
      `error` message mentioning `countdown`.
- [x] `POST /api/odds` for an unreachable mission (example1) returns `reachable: false`,
      `oddsPercent: 0`.
- [x] `POST /api/odds` with example2's intel returns `arrivalDay: 8`, `countdown: 8`, a 4-step
      `itinerary`, and a `bountyHunters` array of the three Hoth sightings sorted by day.
- [x] `POST /api/odds` for example1 returns `itinerary: null` and `arrivalDay: null`.
- [x] `POST /api/odds` with duplicated sightings in the payload echoes them collapsed.

(The `oddsPercent`/`400`/unreachable criteria are already covered by `packages/api/src/app.test.ts`.
The universe endpoint and the widened odds payload are new work introduced by
[universe-map.md](universe-map.md); the `/api/mission` test is replaced, not kept alongside.)

## TODO(verify)

- [ ] No request size/rate limiting beyond the 5 MiB multipart file-size cap — acceptable for a
      technical-test scope; flag if production hardening is ever required.
