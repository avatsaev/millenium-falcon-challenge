# Task 002 — Core domain types, config loaders & routes DB reader

- **Sprint:** sprint-001-core-and-deliverables
- **Status:** done
- **Type:** feature
- **Area:** packages/core
- **Priority:** P1
- **Estimated size:** M
- **Depends on:** task-001

## Goal
Provide validated, typed access to both challenge input files and the SQLite routes table, so the
algorithm and all three deliverables consume trusted data.

## Context / why
`millennium-falcon.json`'s `routes_db` may be relative to the config file's own directory (not the
cwd) — a subtle requirement from the README that must be handled once, centrally. Malformed input
must fail with a clear, actionable message rather than producing wrong odds.

## Scope references
- `swe/specs/overview.md` § Data model overview, § External integrations & configuration
- `swe/specs/architecture/odds-algorithm.md` § Data & persistence touchpoints
- `packages/core/src/{types,errors,guards,config,routes-db,index}.ts`

## What to build
- `types.ts`: `FalconConfig`, `Route`, `BountyHunterSighting`, `EmpireConfig`, `OddsResult`.
- `errors.ts`: `InvalidConfigError`.
- `guards.ts`: canonical `isRecord` guard (single definition, reused — never re-declared per module).
- `config.ts`: `loadFalconConfig(path)`, `loadEmpireConfig(path)`, `parseEmpireConfig(data)`; resolve
  `routes_db` against `dirname(configPath)` when relative; reject non-integer/negative
  `autonomy`/`countdown`/`day` and empty planet names.
- `routes-db.ts`: `loadRoutes(dbPath)` — read-only `better-sqlite3`, `fileMustExist`, validate every
  row (non-empty strings, strictly positive integer `travel_time`), always close the handle.
- `index.ts`: barrel export of the public API.

## Out of scope
The DP algorithm (task-003), HTTP/CLI/UI wiring.

## Acceptance criteria
- [x] `loadFalconConfig` resolves a relative `routes_db` against the config file's directory, not cwd.
- [x] Absolute `routes_db` paths are used as-is.
- [x] Malformed input throws `InvalidConfigError` naming the offending field.
- [x] `loadRoutes` reads the lowercase `routes` table from the example DBs and validates each row.

## Test / verification plan
- Typecheck: `pnpm --filter @falcon/core run typecheck` succeeds.
- Tests: exercised indirectly by `packages/core/src/odds.test.ts` loading all four example fixtures
  end-to-end (config + DB + graph).

## Notes
The real DBs use lowercase `routes`/`origin`/`destination`/`travel_time` while the README documents
them uppercase; SQLite identifiers are case-insensitive, so no special handling is needed.
