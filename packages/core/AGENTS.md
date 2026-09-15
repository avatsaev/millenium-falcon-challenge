# `@falcon/core` — domain layer: config loading, routes DB, planet graph, odds DP

The only library in the workspace. `@falcon/api` and `@falcon/cli` declare
`"@falcon/core": "workspace:*"`; `@falcon/web` does not depend on it and re-declares the wire shapes by
hand in `packages/web/src/api/types.ts`. `src/index.ts` is a cross-package API — anything added, renamed or
removed there is a multi-package change. I/O lives in `config.ts`/`routes-db.ts`; the algorithm is pure.
Workspace-wide rules live in [../../AGENTS.md](../../AGENTS.md).

## Commands

| `pnpm --filter @falcon/core run …` | Effect |
|---|---|
| `build` | tsup → `dist/index.js` + `dist/index.d.ts` (esm, node24, sourcemap, `clean`) |
| `test` | `vitest run` over `src/**/*.test.ts`, node environment |
| `dev` / `test:watch` | `tsup --watch` / `vitest` |
| `typecheck` | `tsc --noEmit` (TypeScript 5.7); `lint` is the identical command |

## Layout

| File | Contents |
|---|---|
| `src/index.ts` | `export *` of `types`/`errors`/`graph`/`odds`, plus named `loadFalconConfig`, `loadEmpireConfig`, `parseEmpireConfig`, `loadRoutes` |
| `src/types.ts` | `FalconConfig`, `Route`, `BountyHunterSighting`, `EmpireConfig`, `ItineraryStep`, `OddsResult` — `readonly` interfaces, no classes |
| `src/errors.ts`, `src/guards.ts` | `InvalidConfigError extends Error`, the only error type raised here; `isRecord`, **not** re-exported by `index.ts` |
| `src/config.ts` | the three config functions + private `readJson`, `requireNonEmptyString`, `requireNonNegativeInt`, `parseBountyHunterSighting` |
| `src/routes-db.ts` | `loadRoutes(dbPath)` — the workspace's only `better-sqlite3` callsite |
| `src/graph.ts`, `src/odds.ts` | `GraphEdge`, `Graph`, `buildGraph(routes, extraPlanets?)`; `ComputeOddsParams`, `dedupeSightings`, `computeOdds` |
| `src/odds.test.ts` | all 17 tests in this package |

## Contracts and invariants

- **Fixture odds are frozen.** `examples/example{1..4}/answer.json` → `0.0`, `0.81`, `0.9`, `1.0`. A
  change to `computeOdds`, `buildGraph`'s sort or the risk model that moves them is a regression.
- **The DP.** Forward sweep over `(day, planetIdx, fuelRemaining)`, `day = 0..countdown`, four flat
  arrays of `stateCount = (countdown + 1) * numPlanets * (autonomy + 1)`, addressed by
  `stateIndex = day * dayStride + planetIdx * planetStride + fuel`: `dp: Float64Array` filled `Infinity`
  (min risky encounters), `stepCount: Int32Array`, `prev: Int32Array` filled `-1`, `prevAction: Int8Array`
  (`ACTION_START` 0 / `ACTION_WAIT_OR_REFUEL` 1 / `ACTION_JUMP` 2). Bound
  `O(countdown · planets · (autonomy+1))`; the largest fixture (example4) is 308 states.
- **Encounters, not probability.** `odds = (1 - CAPTURE_CHANCE_PER_ENCOUNTER) ** minRiskEncounters`,
  constant `0.1`; monotonic in `k`, so minimizing encounters maximizes odds with no float drift.
- **Risk trial = presence.** A day counts iff `{planet, day}` is in the deduped sighting set: day 0 on
  `departure`, every wait/refuel day, a jump's arrival day. Transit days are never checked. Counting
  *pure wait* days is a deliberate pessimistic reading of README:22 — `odds-algorithm.md` §TODO(verify)
  records why, and that it reproduces all four `answer.json` values. Do not narrow it to refuel-only.
- **Wait is always a refuel.** The wait transition targets `fuel = autonomy` unconditionally (free once
  the day is spent); `"wait"` vs `"refuel"` is recovered at reconstruction from `prevDecoded.fuel < autonomy`.
- **Tie-break order** — lexicographic `(encounters, arrivalDay, stepCount, sweepOrder)`. `relax()` takes
  the first and third per state; `arrivalDay` is applied when scanning arrival states (days ascending,
  then lowest `stepCount`); sweep order is first-writer-wins under ascending `(day, planetIdx, fuel)`
  loops, waits relaxed *before* jumps, adjacency sorted `(travelTime asc, destination name asc)` at build
  time — that sort is semantics, not speed: it makes the plan a function of the universe, not of SQLite
  row order. All four are load-bearing; the three exact itineraries in `odds.test.ts` pin them.
  Reconstruction walks `prev` back to `-1`, reverses, maps each state via `decodeState` + `prevAction`.
- **Callers must pass `extraPlanets`.** `computeOdds` throws `InvalidConfigError` when `departure` or
  `arrival` is absent from `graph.planetIndex`; call `buildGraph(routes, [departure, arrival])`.
- **`routes_db` resolves against the config file, not the CWD** (README:75):
  `isAbsolute(field) ? field : resolve(dirname(path), field)`. Never `process.cwd()`.
- **Typed errors only.** Every failure is `throw new InvalidConfigError(...)` — never a string or bare
  `Error` (`computeOdds` guards `autonomy`/`countdown` itself). Loaders validate once at the boundary;
  callers never re-validate loader output.
- **Unreachable is a value, not an error**: `{ odds: 0, reachable: false, minRiskEncounters: null,
  arrivalDay: null, itinerary: null }`.

## Conventions

- Boundary parsing: `isRecord` narrow, then `requireNonEmptyString` / `requireNonNegativeInt`, message
  carrying the field path (`bounty_hunters[2].planet`); bracket access on `Record<string, unknown>`.
- Exported shapes are `readonly` interfaces, array inputs `readonly T[]`; `.js` extension on every
  relative import (`"type": "module"`).
- `better-sqlite3` is `external` in `tsup.config.ts` and confined to `routes-db.ts`; `computeOdds` takes
  a `Graph`, never a path or a handle. Pinned `^13`, and it must stay there: 11.x calls
  `node::RemoveEnvironmentCleanupHook` from `Database::~Database()`, so when V8 finalises the closed
  handle with no entered context the process dies with `Assertion failed: (env) != nullptr` — a SIGABRT
  with no JS stack, reproduced on Node 24 in a container. `loadRoutes` closing the handle does not
  prevent it; only the driver version does.

## Testing

| `describe` group in `src/odds.test.ts` | Covers |
|---|---|
| `computeOdds against the README examples` | four generated `matches example{N}/answer.json` cases |
| `computeOdds edge cases` | departure===arrival with/without a day-0 hunter, disconnected graph, duplicate sightings |
| `dedupeSightings` | collapse + `(day asc, planet asc)` sort |
| `computeOdds itinerary reconstruction` | exact plans for examples 2/3/4, null plan for example1, route-order independence, `autonomy: 0`, self-route classified as a jump |

- Fixture expectations are read from `examples/<name>/answer.json` by `expectedOdds()` and compared with
  `toBeCloseTo(expected, 9)`. Never hard-code `0.81` and friends.
- `loadFixture()` runs the real pipeline (`loadFalconConfig` → `loadEmpireConfig` → `loadRoutes` →
  `buildGraph` → `computeOdds`), so it doubles as the loader integration test.
- `assertItineraryInvariants()` is the plan-independent structural check (day monotonicity, fuel arithmetic
  via `travelTimeBetween`, wait-vs-refuel labelling, encounters == `minRiskEncounters`). Reuse it.
- Assert returned values and observable behaviour, never internal array contents.

## Traps

- `noUncheckedIndexedAccess` is on: every typed-array and adjacency read carries `!` (`dp[targetIdx]!`,
  `graph.adjacency[planetIdx]!`, `planets[a.to]!`). New parallel arrays need the same.
- `dp` uses `Infinity` for "unreached" (sweep skips on `!Number.isFinite(...)`) while `prevAction`/`stepCount`
  default to `0`, so an unvisited state decodes as `ACTION_START` — only finite-`dp` states are walked.
- `buildGraph` stores **both directions** of every route (`adjacency` holds `2 * routes.length` edges; a
  self-route pushes two identical edges onto one list). Do not assume `from !== planet` on a `jump`.
- Risk lookup and dedupe key on `` `${planet}#${day}` ``; a `#` in a planet name aliases, unvalidated.
- `stateCount` scales with `countdown` and nothing bounds it — `requireNonNegativeInt` accepts any integer,
  so a hostile `countdown` allocates ~17 bytes/state; relevant to `@falcon/api`'s `parseEmpireConfig` path.
- `odds` is a float (`0.9 ** k`). Compare with `toBeCloseTo`, never `===`.
- Downstream packages resolve `dist/index.d.ts` (`package.json` `types`), not `src`. Editing `src`
  without rebuilding leaves `api`/`cli` typechecking against stale declarations — build `core` first.

## Specs

Governing: [`odds-algorithm.md`](../../swe/specs/architecture/odds-algorithm.md) — §Public contract,
§Behavior & algorithms, §Itinerary reconstruction, §Error handling & edge cases, §TODO(verify). Consumers:
[`backend-api.md`](../../swe/specs/features/backend-api.md), [`cli-r2d2.md`](../../swe/specs/features/cli-r2d2.md).
