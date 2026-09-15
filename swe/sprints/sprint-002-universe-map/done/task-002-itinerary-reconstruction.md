# Task 002 — Itinerary reconstruction in `computeOdds`

- **Sprint:** sprint-002-universe-map
- **Status:** done
- **Type:** feature
- **Area:** packages/core
- **Priority:** P1
- **Estimated size:** M
- **Depends on:** none

## Goal
Make the DP remember the plan it found: `computeOdds` returns the canonical day-by-day itinerary and the
arrival day alongside the existing odds, without changing any odds value.

## Context / why
Today `computeOdds` collapses the whole search into `minRiskEncounters` and throws the path away, so
nothing downstream can draw where the Falcon went. The map feature is built entirely on this output.

The expected plans are **not guesses** — the README writes them out, and a throwaway reference DP was run
during planning to confirm every one of them is what this tie-break produces:

| Fixture | Expected plan | Result |
|---------|---------------|--------|
| example2 | parked Tatooine d0 → Hoth d6 → refuel Hoth d7 → Endor d8 | README §Example 2 verbatim |
| example3 | Tatooine → Dagobah d6 → refuel d7 → Hoth d8 → Endor d9 | README §Example 3 verbatim |
| example4 | wait Tatooine d1 → Dagobah d7 → refuel d8 → Hoth d9 → Endor d10 | README §Example 4, second listed variant |

## Scope references
- `swe/specs/architecture/odds-algorithm.md` § Public contract, § Itinerary reconstruction,
  § Canonical plan — tie-break order, § Backward walk, § Error handling & edge cases
- `packages/core/src/odds.ts`, `packages/core/src/graph.ts`, `packages/core/src/types.ts`,
  `packages/core/src/index.ts`, `packages/core/src/odds.test.ts`

## What to build
- `types.ts`: add `ItineraryStep`, extend `OddsResult`:
  ```ts
  interface ItineraryStep {
    day: number; planet: string;
    action: "start" | "jump" | "wait" | "refuel";
    from: string | null;      // jump steps only
    fuelAfter: number;
    huntersPresent: boolean;  // a 10% capture roll happened on this day/planet
  }
  // OddsResult gains: arrivalDay: number | null; itinerary: readonly ItineraryStep[] | null
  ```
- `graph.ts`: sort every adjacency list by `(travelTime asc, destination name asc)` inside `buildGraph`.
  This is **not** an optimisation — it makes the reconstructed plan a function of the universe instead of
  SQLite row order. Document that in a comment.
- `odds.ts`:
  - export `dedupeSightings(sightings): BountyHunterSighting[]` — one entry per `planet`/`day`, sorted by
    `(day asc, planet asc)`; reuse it for the DP's internal `Set<"planet#day">`. The API echoes the same
    function's output to the frontend, so there is exactly one definition of "one trial per planet-day".
  - three parallel arrays over the existing `(day, planet, fuel)` state space: `stepCount: Int32Array`,
    `prev: Int32Array` (`-1` sentinel), `prevAction: Int8Array` (`0` start, `1` wait, `2` jump).
    `prevAction` is **stored, not inferred** from "did the planet change", so a degenerate self-route
    (`origin === destination`) cannot be misread as a wait.
  - relax on the lexicographic pair `(encounters, stepCount)`; keep the single ascending
    `day → planetIndex → fuel` sweep with waits relaxed before jumps.
  - best arrival state: scan days ascending, then lowest `stepCount` — giving the documented tie-break
    `(encounters, arrivalDay, stepCount, sweepOrder)`.
  - backward walk emitting `ItineraryStep[]`; recover `refuel` vs `wait` at reconstruction time —
    `refuel` iff the predecessor's `fuelAfter < autonomy`, else `wait`.
- `index.ts`: export the new type and `dedupeSightings`.

## Out of scope
- Any change to `odds`, `reachable` or `minRiskEncounters` values.
- HTTP/API surface (task-003), any frontend code, any CLI change (`packages/cli` must stay untouched).
- A "depart as early as possible" objective — the tie-break stays as specified; both example-4 plans are
  README-listed and either is compliant.

## Acceptance criteria
- [x] All four `examples/*/answer.json` odds still reproduce exactly (`0.0`, `0.81`, `0.9`, `1.0`) — the
      8 existing tests in `odds.test.ts` pass unmodified.
- [x] example2/3/4 itineraries match the three tables above step for step, including each step's
      `action`, `from`, `fuelAfter` and `day`.
- [x] example1 (unreachable) returns `itinerary: null`, `arrivalDay: null`, `reachable: false`.
- [x] Invariants hold for every reachable fixture: first step is
      `{ day: 0, planet: departure, action: "start", from: null, fuelAfter: autonomy }`; `day` strictly
      increases; last step is on `arrival` with `day === arrivalDay <= countdown`; exactly
      `minRiskEncounters` steps have `huntersPresent: true`.
- [x] For a `jump`: `day - prevDay === travelTime(from → planet)` and `fuelAfter === prevFuelAfter - travelTime`.
      For a `wait`/`refuel`: `day === prevDay + 1`, same planet, `fuelAfter === autonomy`, and the action is
      `refuel` exactly when `prevFuelAfter < autonomy`.
- [x] Shuffling the input `routes` array does not change the returned itinerary (adjacency sort).
- [x] `departure === arrival`: itinerary is the single `start` step, `arrivalDay: 0`.
- [x] `autonomy === 0`: wait steps report `fuelAfter: 0` and are labelled `wait`, never `refuel`.
- [x] A self-route (`origin === destination`) in the routes table is classified `jump`, not `wait`.

## Test / verification plan
- Tests: extend `packages/core/src/odds.test.ts` with itinerary cases — the three fixture plans, the
  unreachable case, the invariant assertions, the shuffled-routes determinism case, and the
  `departure === arrival` / `autonomy === 0` / self-route edge cases. A shared invariant helper keeps
  these from turning into copy-paste rows.
- Run: `pnpm --filter @falcon/core run test`, then `pnpm --filter @falcon/core run typecheck`.
- Cross-check: assert each fixture's odds against its `examples/*/answer.json` value, not a literal
  copied into the test.

## Notes
- Memory goes 8 → 17 bytes per state; the asymptotic bound `O(countdown × planets × (autonomy+1))` is
  unchanged (308 states for the fixtures). No performance concern, but do not switch to object-per-state.
- The DP still treats every wait as a refuel (refuelling is free once the day is spent); only the
  *label* is recovered later. Wait days on a hunter planet still count as trials — the pessimistic
  reading that reproduces all four answers (`odds-algorithm.md` §TODO(verify) records why).
