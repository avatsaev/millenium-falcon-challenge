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
| `buildGraph(routes: Route[], extraPlanets?: string[]): Graph` | route rows, optional planets to force-include | `Graph { planets, planetIndex, adjacency }`; every adjacency list is sorted by `(travelTime asc, destination name asc)` | none |
| `dedupeSightings(sightings: BountyHunterSighting[]): BountyHunterSighting[]` | raw sightings from `empire.json` | one entry per `planet`/`day` pair, sorted by `(day asc, planet asc)` | none |
| `computeOdds(params: ComputeOddsParams): OddsResult` | `{ graph, autonomy, departure, arrival, countdown, bountyHunters }` | `{ odds, reachable, minRiskEncounters, arrivalDay, itinerary }` | `InvalidConfigError` on invalid `autonomy`/`countdown`, or departure/arrival not present in the graph |

`ComputeOddsParams`, `OddsResult` and `ItineraryStep` are defined in `packages/core/src/types.ts` and
`packages/core/src/odds.ts`.

```ts
/** One day-stamped action in the Falcon's plan. */
interface ItineraryStep {
  /** Day the Falcon is on `planet` once this action completes (0 for the initial parked state). */
  day: number;
  planet: string;
  action: "start" | "jump" | "wait" | "refuel";
  /** Planet left behind — `jump` steps only, else null. */
  from: string | null;
  /** Fuel in the tank once the action completes, in days of travel. */
  fuelAfter: number;
  /** Bounty hunters scheduled on `planet` that `day` — i.e. a 10% capture roll. */
  huntersPresent: boolean;
}
```

`adjacency` sorting is **not** an optimisation: the odds value is a minimum over edges and therefore
order-independent, but the *reconstructed plan* is chosen by first-writer-wins, so the sweep order must
not depend on SQLite row order. Sorting adjacency at graph-build time is what makes the plan a function
of the universe rather than of the database's insertion history.

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
  for planet in all planets:                       # ascending planet index
    for fuel in 0..autonomy:                       # ascending fuel
      current = dp[day][planet][fuel]
      if current is infinity: continue

      # Option 1: wait one day, always refuel to full (refueling never costs anything extra
      # beyond the day already spent waiting, so it's always taken)
      if day + 1 <= countdown:
        risk = risky(planet, day+1) ? 1 : 0
        relax(dp[day+1][planet][autonomy], current + risk, steps + 1, from = this state, WAIT)

      # Option 2: jump to a neighboring planet if fuel allows (adjacency is pre-sorted)
      for edge (planet -> dest, travelTime) in adjacency[planet]:
        if travelTime > fuel: continue
        nextDay = day + travelTime
        if nextDay > countdown: continue
        risk = risky(dest, nextDay) ? 1 : 0
        relax(dp[nextDay][dest][fuel-travelTime], current + risk, steps + 1, from = this state, JUMP)

# relax() takes a candidate iff it is lexicographically smaller than the incumbent:
#   (encounters, steps) < (dp[target], stepCount[target])
# and records the predecessor state + which action produced it.

minRisk = min over day in 0..countdown, fuel in 0..autonomy of dp[day][arrivalIdx][fuel]
if minRisk is infinity: return { odds: 0, reachable: false, minRiskEncounters: null,
                                 arrivalDay: null, itinerary: null }
return { odds: 0.9 ^ minRisk, reachable: true, minRiskEncounters: minRisk,
         arrivalDay, itinerary: reconstruct(bestArrivalState) }
```

Every transition strictly increases `day`, so the state space is a DAG swept in topological order by
the `day` loop: when day `d` is processed, all `dp[d][*][*]` are final. That holds for any additive,
non-negative cost, which is why adding the `steps` component below is still exactly minimised by the
same single sweep.

Bounty hunter sightings are flattened into a `(day, planet)` bitmap (`riskTable`) before the DP runs, so
`risky()` is a single array read and repeated `{planet, day}` entries in `empire.json` set the same flag
— one risk trial by construction, with no explicit dedupe step in the search. The same normalisation is
exported separately as `dedupeSightings` because the API echoes the canonical schedule back to the
frontend for display; the two agree on "one trial per planet-day" without either depending on the other.

## Itinerary reconstruction

`minRiskEncounters` alone cannot drive a map: a Falcon *position* needs the day-by-day plan. The DP
therefore carries three extra parallel arrays over the same `(day, planet, fuel)` state space. All four
are reached only through the `DpTable` accessors (`isReached`, `encountersAt`, `stepsAt`,
`predecessorOf`), so no caller ever handles a sentinel:

| Array | Type | Meaning |
|-------|------|---------|
| `steps` | `Int32Array` | fewest transitions among the minimum-encounter paths reaching this state |
| `cameFrom` | `Int32Array`, `-1` sentinel | predecessor state id; `-1` is the start state, surfaced as `predecessorOf() == null` |
| `viaAction` | `Int8Array` | `0` wait/refuel, `1` jump — stored rather than inferred, so a degenerate self-route (`origin === destination`) cannot be mistaken for a wait. `start` needs no code: it is the state with no predecessor |

Memory goes from 8 to 17 bytes per state; the asymptotic bound
`O(countdown * planets * (autonomy+1))` is unchanged — `(countdown+1) × planets × (autonomy+1)` states,
i.e. 224/252/280/308 for examples 1-4.

### Canonical plan — tie-break order

Many plans are often equally optimal (README §Example 4 lists two). The chosen one is the
lexicographic minimum of:

1. **risky encounters** — required: this is what determines the odds;
2. **arrival day** — earliest, matching the README's "*can go from Tatooine to Endor in 8 days*";
3. **step count** — the shortest plan, so no gratuitous waiting is displayed;
4. **sweep order** — first-writer-wins under the documented ascending `(day, planetIndex, fuel)` sweep,
   waits relaxed before jumps, adjacency pre-sorted by `(travelTime, destination name)`.

Objectives 1 and 3 are per-state DP costs; objective 2 is applied in `selectArrival`, a single pass over
the arrival planet's reached states keeping the lexicographic minimum of `(encounters, day, steps)`.
Since encounters is the primary DP cost, the `steps` recorded at a state is the minimum over that state's
*minimum-encounter* paths, so `(encounters, arrivalDay, steps)` is genuinely minimised in that priority
order.

### Backward walk

```
reconstruct(arrivalState):
  plan = []
  state = arrivalState
  while state != null:
    predecessor = predecessorOf(state)              # null for the start state only
    action = START                                            if predecessor == null
           = JUMP                                             if predecessor.action == JUMP
           = REFUEL if fuel(predecessor.from) < autonomy else WAIT
    plan.push({ day, planet, action, from: (JUMP ? planet(predecessor.from) : null),
                fuelAfter: fuel, huntersPresent: risky(planet, day) })
    state = predecessor?.from
  reverse(plan)
```

The `wait` vs `refuel` distinction is recovered here rather than tracked in the DP (which deliberately
treats every wait as a refuel, since refuelling is free once the day is spent). This is what lets the
display match the README's own wording — "*Refuel on Hoth*" vs "*Wait for 1 day on Dagobah*".

Invariants the reconstructed plan always satisfies (each is a test):

- `itinerary[0] == { day: 0, planet: departure, action: "start", from: null, fuelAfter: autonomy }`
- `day` is strictly increasing; the last step's `planet == arrival` and `day == arrivalDay <= countdown`
- exactly `minRiskEncounters` steps have `huntersPresent: true`
- for a `jump`: `day - prevDay == travelTime(from -> planet)` and `fuelAfter == prevFuelAfter - travelTime`
- for a `wait`/`refuel`: `day == prevDay + 1`, `planet == prevPlanet`, `fuelAfter == autonomy`, and the
  action is `refuel` exactly when `prevFuelAfter < autonomy`

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
| Reachable mission | `itinerary` is non-null, starts with `start` at day 0 and ends on `arrival` at `arrivalDay` |
| Unreachable mission | `itinerary: null`, `arrivalDay: null` — callers must not assume a plan exists |
| `departure === arrival` | `itinerary` is the single `start` step, `arrivalDay: 0` |
| `autonomy === 0` | no jump is ever affordable, so the only reachable mission is `departure === arrival` and the itinerary is always the single `start` step — a wait step can only add risk, never remove it, so no wait is ever emitted (the fuel dimension collapses to one level; the reconstruction must not mislabel that as `refuel`) |
| Self-route (`origin === destination`) in the routes table | classified as a `jump` via the stored `viaAction`, not silently rendered as a wait |

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
- [x] example2's itinerary is exactly: parked Tatooine (day 0, fuel 6) → jump to Hoth (day 6, fuel 0,
      hunters) → refuel on Hoth (day 7, fuel 6, hunters) → jump to Endor (day 8, fuel 5);
      `arrivalDay: 8`.
- [x] example3's itinerary is exactly: parked Tatooine → jump to Dagobah (day 6, fuel 0) → refuel on
      Dagobah (day 7, fuel 6) → jump to Hoth (day 8, fuel 5, hunters) → jump to Endor (day 9, fuel 4);
      `arrivalDay: 9` — matching README §Example 3 verbatim.
- [x] example4's itinerary is exactly: parked Tatooine → wait on Tatooine (day 1, fuel 6) → jump to
      Dagobah (day 7, fuel 0) → refuel on Dagobah (day 8, fuel 6) → jump to Hoth (day 9, fuel 5) →
      jump to Endor (day 10, fuel 4); `arrivalDay: 10`, zero `huntersPresent` steps — README §Example 4's
      *second* listed plan.
- [x] example1 returns `itinerary: null` and `arrivalDay: null`.
- [x] Every returned itinerary satisfies the structural invariants above (day monotonicity, fuel
      arithmetic, encounter count, wait-vs-refuel labelling) for all four fixtures.
- [x] `dedupeSightings` collapses repeated `{planet, day}` pairs and returns them sorted by
      `(day, planet)`.
- [x] `buildGraph` returns each adjacency list sorted by `(travelTime, destination name)`, and shuffling
      the input `routes` does not change the resulting itinerary.
- [x] `autonomy: 0` with `departure !== arrival` stays unreachable (`itinerary: null`).

(All of the above are covered by `packages/core/src/odds.test.ts` — 17 tests: 4 fixtures, 4 edge cases,
`dedupeSightings`, and 8 itinerary-reconstruction cases including the two `autonomy: 0` branches and a
self-route. Fixture odds are read from `examples/*/answer.json`, never from a literal in the test.)

The three expected itineraries above are **not guesses**: a throwaway reference implementation of the
DP exactly as specified here (sorted adjacency, lexicographic `(encounters, steps)` relaxation,
ascending `(day, planetIndex, fuel)` sweep with waits relaxed before jumps, arrival selection by
`(encounters, day, steps)`) was run against all four fixtures before this spec was finalised. It
reproduced `answer.json`'s odds for every example (`0.0`, `0.81`, `0.9`, `1.0`) and emitted precisely
the step lists pinned above, including example 4 resolving to README's *second* plan variant. The
tie-break is therefore known to be implementable and to match the brief — not assumed.

## TODO(verify)

- [ ] **Example 4's canonical plan is README's second variant** ("wait a day on Tatooine, then travel
      and refuel on Dagobah"), because at day 7 on Dagobah the ascending fuel sweep reaches `fuel: 0`
      before `fuel: 6`. Both plans are optimal and **both are printed in the README**, so either is
      compliant. With the map static ([../features/universe-map.md](../features/universe-map.md)) there
      is no animation-quality reason to prefer the other, so no action is expected. Preferring "depart
      immediately" would require a fourth DP objective ("begin moving as early as possible").
- [ ] **Do pure wait days count as capture trials?** README:22 enumerates exactly two triggers — the
      Falcon *arrives* on a hunter planet, or it *refuels* on one. A day spent stationary with a full
      tank (README:24's hint: "land on a planet with no bounty hunters … and wait for 1 or more days")
      is not listed. The DP counts **every day the Falcon is present** on a hunter planet: the
      pessimistic reading, which reproduces all four `answer.json` values, so it stays unchanged.
      This is an **internal interpretation with no user-visible claim**: the simplified map states
      bounty-hunter presence as a fact from `empire.json` and never attaches a probability to an
      individual step, so nothing in the product asserts a rule the README omits. Recorded so the
      reading is not lost; no product decision needed. Revisiting it would mean splitting the wait
      transition into "refuel (trial)" and "idle with a full tank (no trial)" — all four example answers
      would stay correct, but odds would rise for universes the examples do not cover.
