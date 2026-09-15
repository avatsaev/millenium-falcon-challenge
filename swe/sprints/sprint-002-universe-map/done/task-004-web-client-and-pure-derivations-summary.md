# Task 004 — Web API client cutover + `layout.ts` / `plan.ts` pure modules — Summary

- **Sprint:** sprint-002-universe-map
- **Completed:** 2026-09-15
- **Status:** done

## What was implemented

- `packages/web/src/api.ts` — clean cutover:
  - Added `fetchUniverse(): Promise<Universe>` for `GET /api/universe`, with `Universe` mirroring the
    widened backend contract (`departure`, `arrival`, `autonomy`, `planets`, `routes`).
  - Widened `OddsResponse` with `arrivalDay`, `countdown`, `bountyHunters`, `itinerary`, plus a new
    exported `ItineraryStep` type mirroring `@falcon/core`'s.
  - Deleted `fetchMission` and `MissionInfo` — no alias, no re-export.
  - `parseJsonOrThrow`/`ApiError` behaviour unchanged. The one local `isRecord` type guard was
    promoted to a new `packages/web/src/guards.ts` (mirrors `@falcon/core/src/guards.ts`'s pattern),
    per the project's canonical-guard convention, and imported from there.
- `packages/web/src/layout.ts` (new) — `layoutUniverse(planets, routes, options?)`: Fruchterman–
  Reingold-style relaxation exactly as pseudocoded in `graph-layout.md` §Behavior — even-circle seeding
  with seeded jitter, all-pairs Coulomb repulsion, Hooke springs with `restLength` proportional to
  `travelTime`, weak centring, linear cooling over a fixed 400 iterations, then uniform fit-to-box with
  padding. Determinism: `mulberry32(seed)` is the only randomness source; planets are unioned with
  every route endpoint then sorted lexicographically, routes sorted by `(origin, destination)`, before
  the simulation runs; output coordinates rounded to 2 decimals. Tunables (`MIN_EDGE=90`,
  `EDGE_SCALE=18`, `REPULSION=9000`, `SPRING=0.06`, `CENTERING=0.02`, `MAX_STEP=14`, `EPS=1e-6`) are
  module constants documented as tuned for the fixture universe. `fitToBox`'s degenerate-bbox handling
  (a single point's bounding box has zero span, so it is translated — not scaled — onto the box centre)
  makes the "one planet → box centre" and "zero planets → empty map" edge cases fall out of the general
  algorithm rather than needing a special-cased branch.
- `packages/web/src/plan.ts` (new) — four pure derivations over `ItineraryStep[]`:
  - `planRouteKeys`: undirected `"A|B"` keys (endpoints sorted) from `jump` steps only.
  - `planVisits`: planet → ascending days present (covers `start`/`jump`/`wait`/`refuel` steps).
  - `sightingsByPlanet`: planet → ascending, deduplicated hunter days.
  - `describeStep`: README-shaped one-line prose per action, no probability text.
- `packages/web/src/App.tsx` — minimal, non-optional cutover forced by the acceptance criterion
  (`grep -r "fetchMission\|/api/mission" packages/web/src` must return nothing): swapped the
  `fetchMission`/`["mission"]` query for `fetchUniverse`/`["universe"]`. No new UI, no map, no
  `data-*` hooks — same rendering as before, reading the same three fields (`departure`, `arrival`,
  `autonomy`) off the wider `Universe` payload. The map itself (StarMap/MapDetails) remains task-005.
- `packages/web/src/App.test.tsx` — updated the pre-existing mission-mock tests to intercept
  `/api/universe` instead of `/api/mission` (existing 4 tests, no new tests added here — behaviour
  unchanged, only the endpoint moved).
- New tests: `packages/web/src/layout.test.ts` (8 tests) and `packages/web/src/plan.test.ts` (7 tests).

## Verification

- `pnpm --filter @falcon/web run typecheck` — clean.
- `pnpm --filter @falcon/web run test` — 19/19 passing (3 files: `App.test.tsx` 4, `layout.test.ts` 8,
  `plan.test.ts` 7).
- `grep -rn "fetchMission\|/api/mission" packages/web/src` — no matches (exit 1).
- `pnpm run build` (full workspace) — core, web, api, cli all build green.
- Layout algorithm empirically verified for the fixture universe (Tatooine/Endor/Dagobah/Hoth) via a
  throwaway prototype before transcription: `Tatooine–Dagobah` (6d) renders at ≈335.5 units vs.
  `Dagobah–Hoth` (1d) at ≈193.3 units; every fixture pairwise distance exceeds 150 units (test asserts
  the documented `MIN_SEPARATION = 100` floor); determinism and input-order-independence confirmed to
  1e-9 by reversing both input arrays.
- `plan.ts` derivations verified against a live `computeOdds` run for example2 (not a hand-typed guess):
  `POST /api/odds` with `examples/example2/empire.json` against `examples/example2/millennium-falcon.json`
  returned the itinerary hard-coded into `plan.test.ts` — start Tatooine d0 → jump Hoth d6 (empty tank,
  hunters present) → refuel Hoth d7 → jump Endor d8.

## Deviations from the task file

- The task's "Out of scope" note said no `App.tsx` change; however its own acceptance criterion
  requires zero `fetchMission`/`/api/mission` occurrences anywhere in `packages/web/src`, which
  necessarily includes `App.tsx`. Resolved by making the smallest possible cutover in `App.tsx` (swap
  the query's data source only) rather than leaving the package in a non-building state — no map
  component, styling, or `data-*` hook was added; that is still entirely task-005's scope.
- Promoted the pre-existing local `isRecord` in `api.ts` to `packages/web/src/guards.ts` (not
  requested by the task, but required by the project's canonical-guard-module convention already
  established in `@falcon/core/src/guards.ts`, and triggered automatically while touching that file).
