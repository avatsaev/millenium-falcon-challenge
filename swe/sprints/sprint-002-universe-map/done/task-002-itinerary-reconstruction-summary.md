# Task 002 — Itinerary reconstruction in `computeOdds` — Summary

- **Sprint:** sprint-002-universe-map
- **Completed:** 2026-09-15
- **Status:** done

## What was implemented
`computeOdds` now returns the canonical day-by-day plan alongside the existing odds:
- `types.ts`: added `ItineraryStep` (`day`, `planet`, `action: "start"|"jump"|"wait"|"refuel"`,
  `from`, `fuelAfter`, `huntersPresent`); widened `OddsResult` with `arrivalDay: number | null` and
  `itinerary: readonly ItineraryStep[] | null`.
- `graph.ts`: `buildGraph` now sorts every adjacency list by `(travelTime asc, destination name
  asc)` so the reconstructed plan is a pure function of the universe, not of SQLite row order.
- `odds.ts`: exported `dedupeSightings` (one entry per `planet#day`, sorted `(day asc, planet
  asc)`) reused by the DP's risk-set construction; added three parallel reconstruction arrays over
  the existing `(day, planet, fuel)` state space (`stepCount: Int32Array`, `prev: Int32Array`,
  `prevAction: Int8Array` with stored — not inferred — action codes so a self-route can't be
  misread as a wait); relax now breaks ties on `(encounters, stepCount)`; best-arrival selection
  scans days ascending then lowest `stepCount`; a backward walk emits `ItineraryStep[]`, labelling
  `refuel` vs `wait` from `predecessor.fuelAfter < autonomy`.
- `index.ts`: no change needed — `export * from "./odds.js"` already re-exports `dedupeSightings`.

No `odds`/`reachable`/`minRiskEncounters` value changed for any existing fixture or edge case.

## Files created / changed
| File | Change |
|------|--------|
| `packages/core/src/types.ts` | added `ItineraryStep`, widened `OddsResult` |
| `packages/core/src/graph.ts` | added deterministic adjacency sort + doc comment |
| `packages/core/src/odds.ts` | added `dedupeSightings` export, reconstruction arrays, backward walk |
| `packages/core/src/odds.test.ts` | rewrote: fixture-loading helper, shared invariant assertions, itinerary tests for example2/3/4, unreachable, shuffled-routes determinism, departure===arrival, autonomy===0, self-route classification, `dedupeSightings` unit test |

## How it satisfies the scope
Implements exactly `swe/specs/architecture/odds-algorithm.md` §Itinerary reconstruction / §Canonical
plan — tie-break order / §Backward walk: the DP sweep, relax rule, and tie-break order
`(encounters, arrivalDay, stepCount, sweepOrder)` match the spec verbatim. `graph.ts`'s adjacency
sort matches `graph-layout.md`'s determinism requirement. No HTTP/API/frontend/CLI surface touched
(out of scope, reserved for task-003/004/005).

The three fixture itineraries (example2/3/4) were hand-verified against the DP's actual state
transitions before running the tests (see reasoning trace in this session), then pinned exactly as
written in the task's expected-plan table — all three match the README verbatim (example4 matches
the README's second listed variant, which the sorted-adjacency tie-break selects deterministically).

## Build & test results
```
$ pnpm --filter @falcon/core run typecheck
tsc --noEmit
(no errors)

$ pnpm --filter @falcon/core run test
✓ src/odds.test.ts (17 tests) 12ms
Test Files  1 passed (1)
     Tests  17 passed (17)

$ pnpm --filter @falcon/core run build
CLI ESM Build success — dist/index.js 11.86 KB
DTS Build success — dist/index.d.ts 6.52 KB
```

## Acceptance criteria
- [x] All four `examples/*/answer.json` odds still reproduce exactly (0.0, 0.81, 0.9, 1.0) — verified
      via `computeOdds against the README examples` (odds compared against `answer.json`, not a
      literal copied into the test).
- [x] example2/3/4 itineraries match the three tables step for step (`action`, `from`, `fuelAfter`,
      `day`) — verified by three dedicated `toEqual` assertions on the full itinerary arrays.
- [x] example1 (unreachable) returns `itinerary: null`, `arrivalDay: null`, `reachable: false` —
      verified directly.
- [x] Invariants (first-step shape, strict day increase, last-step-on-arrival, exact
      `minRiskEncounters` `huntersPresent` count) hold for every reachable fixture — verified by the
      shared `assertItineraryInvariants` helper applied to example2/3/4.
- [x] Jump/wait/refuel per-step arithmetic (`day - prevDay === travelTime`, `fuelAfter` deltas,
      `refuel` iff `prevFuelAfter < autonomy`) — verified inside the same invariant helper.
- [x] Shuffling the input `routes` array does not change the returned itinerary — verified by
      reversing example2's route list and asserting an identical itinerary.
- [x] `departure === arrival`: itinerary is the single `start` step, `arrivalDay: 0` — verified by
      two edge-case tests (no risk, and risk present at day 0).
- [x] `autonomy === 0`: verified with a documented deviation — see Follow-ups.
- [x] A self-route (`origin === destination`) is classified `jump`, not `wait` — verified by a
      constructed fixture where the self-jump is the *unique* zero-encounter route (skipping two
      risky waiting-days in one transit, which sequential waiting cannot do), so the reconstruction
      is forced to use it and the test asserts `action: "jump"`.

## Follow-ups / TODO(verify)
- **`autonomy === 0` criterion, resolved as written but not literally**: the task asked for a test
  where "wait steps report `fuelAfter: 0` and are labelled `wait`, never `refuel`". Proved during
  implementation that this is mathematically unreachable: with `autonomy = 0` no real route
  (`travelTime >= 1`) is ever affordable, so the only reachable mission is `departure === arrival`;
  in that case the per-day encounter DP is non-decreasing (each day only ever adds risk, never
  removes it), so day 0 is *always* the sequence minimum and therefore always wins the
  earliest-day tie-break — a `wait` step can never appear in the optimal reconstruction at
  `autonomy === 0`, regardless of the hunter schedule. The test instead pins the actually-reachable
  boundary behaviour (single `start` step, `fuelAfter: 0`, no mislabelled `refuel`) and documents
  the proof inline as a code comment, so a future reader doesn't rediscover this by trial and
  error. No source change follows from this — it is a property of the algorithm, not a bug.
- task-003 (depends on this task) can now build `GET /api/universe` and widen the odds payload
  using the new `arrivalDay`/`itinerary`/`dedupeSightings` outputs.
