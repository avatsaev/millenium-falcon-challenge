# Architecture — Odds-of-success algorithm

> Part of: [../overview.md](../overview.md)
> Dependencies: none (pure domain logic)

## Purpose

Computes the probability that the Millennium Falcon reaches the arrival planet at or before the
countdown deadline, minimizing exposure to bounty hunters along the way. Shared by `packages/api` and
`packages/cli` via `packages/core`.

## Public contract

| Signature | Inputs | Outputs | Errors |
|-----------|--------|---------|--------|
| `buildGraph(routes: Route[], extraPlanets?: string[]): Graph` | route rows, optional planets to force-include | `Graph { planets, planetIndex, adjacency }` | none |
| `computeOdds(params: ComputeOddsParams): OddsResult` | `{ graph, autonomy, departure, arrival, countdown, bountyHunters }` | `{ odds, reachable, minRiskEncounters }` | `InvalidConfigError` on invalid `autonomy`/`countdown`, or departure/arrival not present in the graph |

`ComputeOddsParams` and `OddsResult` are defined in `packages/core/src/types.ts` and
`packages/core/src/odds.ts`.

## Behavior & algorithms

Key insight: the per-encounter capture formula `P(capture) = 1 - 0.9^k` (k = number of risky
landings) is monotonic increasing in `k`, so **maximizing success probability is equivalent to
minimizing k** — the DP tracks minimum encounter count, not probability directly, avoiding floating
point accumulation error across states.

A "risky landing" is any day the Falcon is physically present on a planet that matches a
`{planet, day}` bounty hunter sighting: the initial departure (day 0), a wait/refuel day, or a
jump's arrival day. Days spent in transit during a multi-day jump are never checked.

State: `(day, planetIndex, fuelRemaining)`. Forward DP, single sweep `day = 0..countdown` (every
transition strictly increases `day`, so no revisiting is needed):

```
dp[0][departureIdx][autonomy] = risky(departure, day=0) ? 1 : 0
all other dp[...] = +infinity

for day in 0..countdown:
  for planet in all planets:
    for fuel in 0..autonomy:
      current = dp[day][planet][fuel]
      if current is infinity: continue

      # Option 1: wait one day, always refuel to full (refueling never costs anything extra
      # beyond the day already spent waiting, so it's always taken)
      if day + 1 <= countdown:
        risk = risky(planet, day+1) ? 1 : 0
        dp[day+1][planet][autonomy] = min(dp[day+1][planet][autonomy], current + risk)

      # Option 2: jump to a neighboring planet if fuel allows
      for edge (planet -> dest, travelTime) in adjacency[planet]:
        if travelTime > fuel: continue
        nextDay = day + travelTime
        if nextDay > countdown: continue
        risk = risky(dest, nextDay) ? 1 : 0
        dp[nextDay][dest][fuel - travelTime] = min(dp[nextDay][dest][fuel-travelTime], current + risk)

minRisk = min over day in 0..countdown, fuel in 0..autonomy of dp[day][arrivalIdx][fuel]
if minRisk is infinity: return { odds: 0, reachable: false, minRiskEncounters: null }
return { odds: 0.9 ^ minRisk, reachable: true, minRiskEncounters: minRisk }
```

Bounty hunter sightings are deduplicated into a `Set<"planet#day">` lookup before the DP runs, so
repeated `{planet, day}` entries in `empire.json` count as a single risk trial.

## Data & persistence touchpoints

No persistence — pure in-memory computation over a `Graph` built from `Route[]` (loaded from
SQLite by `packages/core/src/routes-db.ts`, out of scope for this spec) and `BountyHunterSighting[]`
(parsed from `empire.json`).

`buildGraph`'s `extraPlanets` parameter exists specifically so `departure`/`arrival` are always
addressable graph nodes even when isolated (no route references them) — callers **must** pass
`[falconConfig.departure, falconConfig.arrival]`.

## Error handling & edge cases

| Condition | Expected behavior |
|-----------|-------------------|
| `autonomy` or `countdown` not a non-negative integer | throws `InvalidConfigError` |
| `departure`/`arrival` not present in `graph.planetIndex` | throws `InvalidConfigError` |
| `departure === arrival` | valid; DP still runs, day-0 risk check applies (see edge case tests) |
| Arrival unreachable within `countdown` days from any state | `{ odds: 0, reachable: false, minRiskEncounters: null }` |
| Duplicate `{planet, day}` sightings | collapsed to one risk trial (`Set` dedup) |
| `travelTime` exceeds `autonomy` for every edge from a planet (never refuelable to reach it) | naturally unreachable — no special-case needed, DP just never populates that state |

## Dependencies on other specs

- None. This is the lowest-level building block; [features/backend-api.md](../features/backend-api.md)
  and [features/cli-r2d2.md](../features/cli-r2d2.md) both depend on it.

## Acceptance criteria

- [x] Given `examples/example1` (unreachable in 7 days), `computeOdds` returns `odds: 0`.
- [x] Given `examples/example2` (2 risky landings on Hoth), returns `odds: 0.81`.
- [x] Given `examples/example3` (1 risky landing on Hoth), returns `odds: 0.9`.
- [x] Given `examples/example4` (0 risky landings, wait-then-travel), returns `odds: 1.0`.
- [x] Given `departure === arrival` with no hunters on day 0, returns `odds: 1`, `minRiskEncounters: 0`.
- [x] Given `departure === arrival` with a hunter on day 0, returns `odds: 0.9`, `minRiskEncounters: 1`.
- [x] Given a disconnected graph, returns `{ odds: 0, reachable: false, minRiskEncounters: null }`.
- [x] Given duplicate `{planet, day}` sightings, they count as a single risk trial.

(All verified by `packages/core/src/odds.test.ts`, 8 passing tests — this feature is already fully
implemented; no further tasks needed beyond what sprint-001 already delivered.)

## TODO(verify)

- None outstanding — algorithm behavior is fully pinned by the four README examples plus edge-case
  tests.
