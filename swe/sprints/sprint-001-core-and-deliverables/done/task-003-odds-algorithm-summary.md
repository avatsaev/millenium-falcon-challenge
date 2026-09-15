# Task 003 — Graph builder & DP odds-of-success algorithm — Summary

- **Sprint:** sprint-001-core-and-deliverables
- **Completed:** 2026-09-08
- **Status:** done

## What was implemented
`buildGraph` (undirected adjacency, with `extraPlanets` so departure/arrival are always addressable)
and `computeOdds` — a forward DP over `(day, planet, fuel)` minimizing risky landings, returning
`0.9 ** minRisk`.

## Files created / changed
| File | Change |
|------|--------|
| `packages/core/src/graph.ts` | created (`buildGraph`, `Graph`, `GraphEdge`) |
| `packages/core/src/odds.ts` | created (`computeOdds`, `ComputeOddsParams`) |
| `packages/core/src/odds.test.ts` | added 8 tests |

## How it satisfies the scope
Implements `swe/specs/architecture/odds-algorithm.md` § Behavior & algorithms exactly: dedupes
sightings into a `planet#day` set; risk trials are day 0, wait/refuel days, and jump arrival days
(never in-transit days); wait always refuels to full; single forward sweep because every transition
strictly increases `day`; unreachable -> `{ odds: 0, reachable: false, minRiskEncounters: null }`.
Stored as a flat `Float64Array` to avoid per-state allocation.

## Build & test results
```
$ pnpm --filter @falcon/core run test
 ✓ src/odds.test.ts (8 tests) 7ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

## Acceptance criteria
- [x] example1 -> 0.0, example2 -> 0.81, example3 -> 0.9, example4 -> 1.0 — each asserted against the
      fixture's own `answer.json` rather than a hardcoded literal.
- [x] `departure === arrival` with/without a day-0 hunter -> `odds: 1`/`0.9`.
- [x] Disconnected graph -> unreachable result.
- [x] Duplicate sightings collapse to one risk trial.
- [x] Invalid `autonomy`/`countdown`/unknown planets -> `InvalidConfigError`.

## Follow-ups / TODO(verify)
- The DP returns only the minimum encounter count, not the itinerary that achieves it. Route
  reconstruction is deliberately out of scope (see sprint-003 backlog for the optional follow-up).
