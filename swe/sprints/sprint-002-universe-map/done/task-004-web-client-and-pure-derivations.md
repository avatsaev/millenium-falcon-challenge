# Task 004 — Web API client cutover + `layout.ts` / `plan.ts` pure modules

- **Sprint:** sprint-002-universe-map
- **Status:** done
- **Type:** feature
- **Area:** packages/web
- **Priority:** P1
- **Estimated size:** M
- **Depends on:** task-003

## Goal
Land everything the map needs that is **not** React: the typed client for the new endpoints, the
deterministic planet layout, and the itinerary derivations — all unit-tested without rendering.

## Context / why
Geometry and per-plan derivations are the parts most likely to be subtly wrong and the parts cheapest to
test in isolation. Keeping them as plain functions (`monorepo-tooling.md` §Pure derivations) means the
components in task-005 are thin and the map's correctness is provable without a DOM.

The routes database has **no coordinates** — its only columns are `origin`, `destination`, `travel_time`
— so positions must be derived, and derived deterministically, or every render and every screenshot
jitters.

## Scope references
- `swe/specs/architecture/graph-layout.md` (whole document — this task implements it)
- `swe/specs/features/universe-map.md` § Public contract, § Data shapes consumed
- `swe/specs/features/frontend-c3po.md` § Public contract
- Create: `packages/web/src/layout.ts`, `packages/web/src/plan.ts`,
  `packages/web/src/layout.test.ts`, `packages/web/src/plan.test.ts`
- Modify: `packages/web/src/api.ts`

## What to build
- `api.ts` — clean cutover:
  - `fetchUniverse(): Promise<Universe>` for `GET /api/universe`;
  - widen `OddsResponse` with `arrivalDay`, `countdown`, `bountyHunters`, `itinerary` and add
    `ItineraryStep`;
  - **delete** `fetchMission` and `MissionInfo`; no alias, no re-export.
  - `parseJsonOrThrow` / `ApiError` behaviour is unchanged.
- `layout.ts` — `layoutUniverse(planets, routes, options?): ReadonlyMap<string, {x, y}>`:
  - Fruchterman–Reingold-style relaxation exactly as pseudocoded in `graph-layout.md` §Behavior:
    all-pairs repulsion, springs on real routes with **rest length ∝ travelTime**, weak centring, linear
    cooling, fixed `iterations` (no convergence check), then uniform fit-to-box with padding.
  - Determinism is load-bearing: `mulberry32(seed)` only — no `Math.random`, `Date.now`,
    `performance.now` or DOM measurement; planets sorted lexicographically and routes sorted by
    `(origin, destination)` before anything runs; coordinates rounded to 2 decimals on the way out.
  - Defaults: `width 1000`, `height 620`, `padding 72`, `seed 0x5eed`, `iterations 400`. Tunables
    (`MIN_EDGE`, `EDGE_SCALE`, `REPULSION`, `SPRING`, `CENTERING`, `MAX_STEP`, `EPS`) are module
    constants, documented as tuned for the fixture universe.
- `plan.ts` — pure derivations over an itinerary:
  - `planRouteKeys(itinerary): ReadonlySet<string>` — undirected `"A|B"` keys (endpoints sorted) of the
    edges the plan traverses;
  - `planVisits(itinerary): ReadonlyMap<string, number[]>` — planet → ascending days the plan is there;
  - `sightingsByPlanet(sightings): ReadonlyMap<string, number[]>` — planet → ascending hunter days;
  - `describeStep(step): string` — README-shaped prose and nothing more:
    `start` → `Day 0 — parked on Tatooine, tank full.`; `jump` → `Day 6 — travel from Tatooine to Hoth.`;
    `refuel` → `Day 7 — refuel on Hoth.`; `wait` → `Day 1 — wait on Tatooine.`
    **No probability text, ever** — the aggregate risk statement stays in the existing odds caption.

## Out of scope
- Any React component or `App.tsx` change (task-005). Nothing in this task imports React.
- Styling, SVG markup, `data-*` hooks.

## Acceptance criteria
- [x] `layoutUniverse` called twice with identical input returns identical coordinates.
- [x] Shuffling `planets` and `routes` produces identical coordinates — input-order independent.
- [x] For the fixture universe, drawn `Tatooine–Dagobah` (6 days) is strictly longer than `Dagobah–Hoth`
      (1 day): travel time reads as distance.
- [x] Every coordinate satisfies `padding <= x <= width - padding` (same for `y`).
- [x] One planet, no routes → that planet at the box centre. Zero planets → empty map, no throw.
- [x] A route naming a planet absent from `planets` still yields a position for it.
- [x] No two fixture planets are closer than the documented minimum separation.
- [x] `planRouteKeys` for example2's itinerary is exactly `{"Hoth|Tatooine", "Endor|Hoth"}` and excludes
      `Dagobah|Tatooine`; key endpoints are sorted so direction of travel cannot produce two keys for one
      route.
- [x] `planVisits` for example2 maps `Tatooine → [0]`, `Hoth → [6, 7]`, `Endor → [8]`.
- [x] `describeStep` output for all four actions matches the strings above, and no output of any
      `plan.ts` function contains `%` or the word "captured".
- [x] `grep -r "fetchMission\|/api/mission" packages/web/src` returns nothing.

## Test / verification plan
- Tests: `packages/web/src/layout.test.ts` (determinism, order-independence, distance ∝ travel time,
  in-box, degenerate inputs) and `packages/web/src/plan.test.ts` (the four derivations against a
  hard-coded example2 itinerary matching task-002's verified output).
- Run: `pnpm --filter @falcon/web run test`, then `pnpm --filter @falcon/web run typecheck`.
- No snapshot files: assert relations (ordering, bounds, set membership), not coordinate literals, so a
  tunable change does not force a snapshot rewrite while still pinning the contract.

## Notes
- Cost is `O(iterations × planets²)` ≈ 6 400 vector ops for the fixtures, computed once per universe
  (memoised in task-005), never per render.
- Minimum planet separation is best-effort for arbitrary graphs and asserted only for the fixtures
  (`graph-layout.md` §TODO(verify) records the deterministic post-pass fallback if that ever changes).
