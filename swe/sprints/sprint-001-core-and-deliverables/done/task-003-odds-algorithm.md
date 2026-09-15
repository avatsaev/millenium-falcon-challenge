# Task 003 — Graph builder & DP odds-of-success algorithm

- **Sprint:** sprint-001-core-and-deliverables
- **Status:** done
- **Type:** feature
- **Area:** packages/core
- **Priority:** P1
- **Estimated size:** M
- **Depends on:** task-002

## Goal
Compute the probability the Falcon reaches the arrival planet at or before the countdown, minimizing
bounty-hunter exposure — the single shared brain behind all three deliverables.

## Context / why
`P(capture) = 1 - 0.9^k` is monotonic in `k` (risky landings), so maximizing success probability
reduces to **minimizing k**. That turns a probability-maximization problem into a shortest-path/DP
problem over `(day, planet, fuel)` and avoids accumulating floating-point error across states.

## Scope references
- `swe/specs/architecture/odds-algorithm.md` § Behavior & algorithms (full pseudocode), § Error
  handling & edge cases
- `packages/core/src/graph.ts`, `packages/core/src/odds.ts`, `packages/core/src/odds.test.ts`

## What to build
- `buildGraph(routes, extraPlanets?)`: undirected adjacency (both directions per row); `extraPlanets`
  guarantees `departure`/`arrival` are addressable nodes even when isolated.
- `computeOdds({ graph, autonomy, departure, arrival, countdown, bountyHunters })`: forward DP per the
  spec pseudocode; dedupe sightings into a `planet#day` set; a "risky landing" is day 0, any
  wait/refuel day, or a jump's arrival day — never an in-transit day. Treat every wait as a refuel
  (free beyond the day already spent). Return
  `{ odds: 0.9 ** minRisk, reachable, minRiskEncounters }`, or `{ odds: 0, reachable: false,
  minRiskEncounters: null }` when unreachable.

## Out of scope
HTTP/CLI/UI surfaces; route reconstruction (which itinerary achieves the odds).

## Acceptance criteria
- [x] example1 -> `odds: 0`; example2 -> `0.81`; example3 -> `0.9`; example4 -> `1.0` (matched against
      each `examples/*/answer.json`).
- [x] `departure === arrival`, no day-0 hunters -> `odds: 1`, `minRiskEncounters: 0`.
- [x] `departure === arrival`, day-0 hunter -> `odds: 0.9`, `minRiskEncounters: 1`.
- [x] Disconnected graph -> `{ odds: 0, reachable: false, minRiskEncounters: null }`.
- [x] Duplicate `{planet, day}` sightings count as one risk trial.
- [x] Invalid `autonomy`/`countdown`, or unknown departure/arrival -> `InvalidConfigError`.

## Test / verification plan
- Tests: `packages/core/src/odds.test.ts` — 4 example-fixture tests (compared to `answer.json`) plus
  4 edge-case tests; `pnpm --filter @falcon/core run test` all pass.
- Build: `pnpm --filter @falcon/core run build` succeeds.

## Notes
Flat `Float64Array` DP indexed by `day*dayStride + planet*planetStride + fuel` — no per-state object
allocation.
