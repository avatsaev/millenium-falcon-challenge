# Task 002 — Core domain types, config loaders & routes DB reader — Summary

- **Sprint:** sprint-001-core-and-deliverables
- **Completed:** 2026-09-08
- **Status:** done

## What was implemented
The `@falcon/core` data layer: domain types, a single `InvalidConfigError`, one canonical `isRecord`
guard, validating loaders for both challenge JSON files, and a read-only SQLite routes reader.

## Files created / changed
| File | Change |
|------|--------|
| `packages/core/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` | created |
| `packages/core/src/types.ts` | created (`FalconConfig`, `Route`, `BountyHunterSighting`, `EmpireConfig`, `OddsResult`) |
| `packages/core/src/errors.ts` | created (`InvalidConfigError`) |
| `packages/core/src/guards.ts` | created (canonical `isRecord`) |
| `packages/core/src/config.ts` | created (`loadFalconConfig`, `loadEmpireConfig`, `parseEmpireConfig`) |
| `packages/core/src/routes-db.ts` | created (`loadRoutes`) |
| `packages/core/src/index.ts` | created (barrel export) |

## How it satisfies the scope
Matches `swe/specs/overview.md` § Data model overview and § External integrations: `routes_db` is
resolved against `dirname(millennium-falcon.json)` when relative and used as-is when absolute; every
field is validated with a message naming the offending field; `loadRoutes` opens the DB
`readonly`/`fileMustExist`, validates each row, and closes in a `finally`.

## Build & test results
```
$ pnpm --filter @falcon/core run typecheck
(tsc --noEmit: no errors)

$ pnpm --filter @falcon/core run build
ESM dist/index.js 8.61 KB | DTS dist/index.d.ts 4.56 KB — Build success
```

## Acceptance criteria
- [x] Relative `routes_db` resolves against the config file's directory (all four example fixtures
      load their sibling `universe.db` successfully in `odds.test.ts`).
- [x] Absolute `routes_db` used as-is (`isAbsolute` branch).
- [x] Malformed input throws `InvalidConfigError` naming the field (verified live: the API returned
      `"countdown" must be a non-negative integer, got "nope"`).
- [x] `loadRoutes` reads the lowercase `routes` table from every example DB.

## Follow-ups / TODO(verify)
- A `guards.ts` module holds the one permitted `isRecord`; per project rules it must never be
  re-declared per module.
