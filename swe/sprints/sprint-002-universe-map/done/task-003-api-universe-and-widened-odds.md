# Task 003 — `GET /api/universe` + widened odds payload

- **Sprint:** sprint-002-universe-map
- **Status:** done
- **Type:** feature
- **Area:** packages/api
- **Priority:** P1
- **Estimated size:** S
- **Depends on:** task-002

## Goal
Expose the universe the odds were computed on, and echo the mission intel plus the canonical plan in the
odds response, so the frontend needs exactly one extra request and never re-parses the uploaded file.

## Context / why
The frontend cannot draw a map from `{ departure, arrival, autonomy }`: it needs planets and routes. It
also needs the countdown, the normalised hunter schedule and the itinerary, all of which the server
already holds at the moment it answers — echoing them is strictly cheaper and more consistent than
re-parsing the upload in the browser.

`GET /api/universe` is a strict superset of `GET /api/mission` (same three fields, plus the graph), so
`/api/mission` is **removed**, not deprecated: one request, one query key, no alias, no redirect.

Startup semantics do not change: README:61 pins config loading to server start. `server.ts` already
loads the falcon config, routes and graph once before `listen`; `/api/universe` is a pure projection of
that in-memory state. Nothing becomes request-scoped.

## Scope references
- `swe/specs/features/backend-api.md` § Public contract, § Behavior & algorithms, § Error handling
- `swe/specs/architecture/odds-algorithm.md` § Public contract (`dedupeSightings`, `OddsResult`)
- `packages/api/src/app.ts`, `packages/api/src/app.test.ts`

## What to build
- In `buildApp`, replace the `GET /api/mission` handler with:
  ```
  GET /api/universe -> {
    departure, arrival, autonomy,          // from the startup falconConfig
    planets: graph.planets,                // insertion order; the client sorts for layout
    routes: [{ origin, destination, travelTime }]   // one entry per undirected route, not per edge
  }
  ```
  Routes must be de-duplicated back to one row per undirected pair (the graph stores both directions),
  emitted deterministically — sort by `(origin, destination)`.
- Widen the `POST /api/odds` response to
  `{ odds, oddsPercent, reachable, minRiskEncounters, arrivalDay, countdown, bountyHunters, itinerary }`:
  - `arrivalDay` / `itinerary` straight from `computeOdds` (both `null` when unreachable);
  - `countdown` echoed from the *validated* `empireConfig`, never from the raw payload;
  - `bountyHunters` echoed through `dedupeSightings` from `@falcon/core`, so the client's schedule and
    the DP's trial count are the same normalisation.
- No change to `oddsPercent` rounding, to the 400 error contract, to the multipart size cap, or to
  static-file serving.

## Out of scope
- Any frontend code (tasks 004-006), any core algorithm change (task-002), any new endpoint beyond
  `/api/universe`, auth, rate limiting, caching headers.

## Acceptance criteria
- [x] `GET /api/universe` returns the four fixture planets and exactly five routes with their travel
      times, plus the startup `departure`/`arrival`/`autonomy`.
- [x] Each undirected route appears **once** (5 rows, not 10), and the row order is stable across
      repeated requests.
- [x] `GET /api/mission` returns 404 — the route is gone, with no alias or redirect.
- [x] `POST /api/odds` with example2's JSON body returns `oddsPercent: 81`, `arrivalDay: 8`,
      `countdown: 8`, a 4-step `itinerary`, and the three Hoth sightings in `bountyHunters` sorted by day.
- [x] `POST /api/odds` with a real multipart upload of example3's file returns `oddsPercent: 90` and
      `arrivalDay: 9`.
- [x] `POST /api/odds` for example1 returns `reachable: false`, `oddsPercent: 0`, `itinerary: null`,
      `arrivalDay: null` — and still echoes `countdown: 7` and the hunter schedule, since the map shows
      why it failed.
- [x] Duplicate `{planet, day}` entries in an uploaded `empire.json` are collapsed in the echoed
      `bountyHunters`.
- [x] A malformed payload (`countdown` non-numeric) still returns `400` with an `error` mentioning
      `countdown`, and no partial payload.

## Test / verification plan
- Tests: update `packages/api/src/app.test.ts` — replace the `/api/mission` test with an `/api/universe`
  test (the old one is deleted, not kept alongside), extend the odds tests to assert the new fields, and
  add the duplicate-sightings collapse case. Use `app.inject`, as the existing tests do.
- Run: `pnpm --filter @falcon/api run test`, then `pnpm --filter @falcon/api run typecheck`.
- Manual: start the server with `FALCON_CONFIG_PATH=examples/example2/millennium-falcon.json`, then
  `curl -s localhost:3000/api/universe`, a `curl -F file=@examples/example3/empire.json` upload, and
  `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/mission` → `404`.

## Notes
- `graph.planets` order is insertion order (`[Tatooine, Endor, Dagobah, Hoth]` for the fixtures, because
  `buildGraph` forces departure/arrival in first). Ship it as-is; `layoutUniverse` sorts internally so
  geometry cannot depend on it.
- Do not send `graph.adjacency` — it is an index-based internal structure. The client gets names.
