# Task 003 — `GET /api/universe` + widened odds payload — Summary

- **Sprint:** sprint-002-universe-map
- **Completed:** 2026-09-15
- **Status:** done

## What was implemented
- `packages/api/src/app.ts`: replaced the `GET /api/mission` handler with `GET /api/universe`,
  returning `{ departure, arrival, autonomy, planets, routes }` from the startup `falconConfig` and
  `graph`. Added `undirectedRoutes(graph)`: collapses the graph's bidirectional adjacency to one
  row per undirected route, normalising each row's `origin`/`destination` to alphabetical order
  and sorting the whole array by `(origin asc, destination asc)`, so the response is deterministic
  regardless of planet-index insertion order or which direction the adjacency happened to store
  first.
- Widened `POST /api/odds`'s response with `arrivalDay`, `countdown` (echoed from the *validated*
  `empireConfig`, never the raw payload), `bountyHunters` (via `@falcon/core`'s `dedupeSightings`,
  the same normalisation the DP itself used), and `itinerary` — all four straight from
  `computeOdds`'s widened `OddsResult` (task-002).
- No change to `oddsPercent` rounding, the 400 error contract, the multipart size cap, or static
  file serving.

## Files created / changed
| File | Change |
|------|--------|
| `packages/api/src/app.ts` | replaced `/api/mission` with `/api/universe`; widened `/api/odds` response |
| `packages/api/src/app.test.ts` | replaced the mission test with universe + 404-gone tests; widened both odds tests; added a real multipart-upload test and a duplicate-sightings collapse test |

## How it satisfies the scope
Matches `swe/specs/features/backend-api.md` §Public contract exactly: `/api/universe` is a strict
superset of the removed `/api/mission` (same three fields plus `planets`/`routes`); `/api/mission`
returns a plain 404, no alias/redirect, per the task's explicit "removed, not deprecated"
instruction. `arrivalDay`/`itinerary` come straight from `@falcon/core`'s `OddsResult` (task-002);
`bountyHunters` reuses `dedupeSightings` so the client's schedule and the DP's trial count share one
normalisation, per `odds-algorithm.md` §Public contract. Startup semantics unchanged — `/api/universe`
is a pure projection of the `falconConfig`/`graph` captured once before `listen`, matching README:61.
`packages/web` (which still calls the now-404 `/api/mission`) is untouched — its cutover is
task-004, explicitly out of scope here.

## Build & test results
```
$ pnpm --filter @falcon/api run typecheck
tsc --noEmit
(no errors)

$ pnpm --filter @falcon/api run test
✓ src/app.test.ts (8 tests) 46ms
Test Files  1 passed (1)
     Tests  8 passed (8)

$ pnpm --filter @falcon/api run build
CLI ESM Build success — dist/server.js 4.13 KB
```

Manual verification (`FALCON_CONFIG_PATH=examples/example2/millennium-falcon.json`, server on a
free port to avoid an unrelated process already bound to the default 4000):
```
$ curl -s localhost:3999/api/universe
{"departure":"Tatooine","arrival":"Endor","autonomy":6,
 "planets":["Tatooine","Endor","Dagobah","Hoth"],
 "routes":[{"origin":"Dagobah","destination":"Endor","travelTime":4},
           {"origin":"Dagobah","destination":"Hoth","travelTime":1},
           {"origin":"Dagobah","destination":"Tatooine","travelTime":6},
           {"origin":"Endor","destination":"Hoth","travelTime":1},
           {"origin":"Hoth","destination":"Tatooine","travelTime":6}]}

$ curl -s -o /dev/null -w '%{http_code}\n' localhost:3999/api/mission
404

$ curl -s -F file=@examples/example3/empire.json localhost:3999/api/odds
{"odds":0.9,"oddsPercent":90,"reachable":true,"minRiskEncounters":1,"arrivalDay":9,
 "countdown":9,"bountyHunters":[{"planet":"Hoth","day":6},{"planet":"Hoth","day":7},{"planet":"Hoth","day":8}],
 "itinerary":[... 5 steps ...]}
```

## Acceptance criteria
- [x] `GET /api/universe` returns the four fixture planets and exactly five routes with their travel
      times, plus the startup `departure`/`arrival`/`autonomy` — verified by test and manual curl.
- [x] Each undirected route appears once (5 rows, not 10), stable across repeated requests —
      verified by test (second request's `routes` deep-equals the first) and by the manual curl
      above showing exactly 5 rows.
- [x] `GET /api/mission` returns 404 — verified by test and manual curl.
- [x] `POST /api/odds` with example2's JSON body returns `oddsPercent: 81`, `arrivalDay: 8`,
      `countdown: 8`, a 4-step `itinerary`, and the three Hoth sightings sorted by day — verified by
      test.
- [x] `POST /api/odds` with a real multipart upload of example3's file returns `oddsPercent: 90` and
      `arrivalDay: 9` — verified by a dedicated multipart-upload test and the manual curl above.
- [x] `POST /api/odds` for example1 returns `reachable: false`, `oddsPercent: 0`, `itinerary: null`,
      `arrivalDay: null`, while still echoing `countdown: 7` and the hunter schedule — verified by
      test.
- [x] Duplicate `{planet, day}` entries in an uploaded payload are collapsed in the echoed
      `bountyHunters` — verified by a dedicated test.
- [x] A malformed payload (`countdown` non-numeric) still returns 400 with an `error` mentioning
      `countdown`, no partial payload — verified by the pre-existing test (unmodified).

## Follow-ups / TODO(verify)
- task-004 depends on this task: `packages/web`'s `fetchMission`/`/api/mission` usage must be cut
  over to `/api/universe` and the widened odds response — currently unbuilt/uncalled by the API but
  still present in `packages/web/src/api.ts` and `App.tsx`, exactly as scoped (frontend is task-004's
  responsibility, not touched here).
