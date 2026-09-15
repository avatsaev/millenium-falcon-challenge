# Task 004 — CLI: give-me-the-odds (R2D2)

- **Sprint:** sprint-001-core-and-deliverables
- **Status:** done
- **Type:** feature
- **Area:** packages/cli
- **Priority:** P1
- **Estimated size:** S
- **Depends on:** task-003

## Goal
Ship the mandatory CLI deliverable: two file-path arguments in, a plain 0-100 integer on stdout.

## Context / why
The README specifies `give-me-the-odds <millennium-falcon.json> <empire.json>` printing `81`. It must
work with no server running — it calls `@falcon/core` directly.

## Scope references
- `swe/specs/features/cli-r2d2.md` § Public contract, § Behavior & algorithms, § Error handling
- `packages/cli/src/run.ts`, `packages/cli/src/cli.ts`, `packages/cli/src/run.test.ts`, `packages/cli/package.json`

## What to build
- `run.ts`: `computeOddsPercent(falconPath, empirePath): Promise<number>` — load both configs + routes,
  build the graph with `[departure, arrival]`, compute odds, return `Math.round(odds * 100)`.
- `cli.ts`: shebang entrypoint; missing argv -> usage on stderr + exit 1; any error -> `error.message`
  on stderr + exit 1; success -> integer on stdout.
- `package.json`: `bin: { "give-me-the-odds": "./dist/cli.js" }`.

## Out of scope
Installing the bin on `PATH` (sprint-002); flags/options beyond the two positional paths.

## Acceptance criteria
- [x] example1 -> `0`, example2 -> `81`, example3 -> `90`, example4 -> `100`.
- [x] No args -> usage message on stderr, exit code 1.
- [x] Nonexistent `empire.json` -> descriptive error on stderr, exit code 1.
- [x] An unreachable mission prints `0` and exits 0 (a valid result, not an error).

## Test / verification plan
- Tests: `packages/cli/src/run.test.ts` — 4 fixture tests; `pnpm --filter @falcon/cli run test` passes.
- Manual: run the built `node packages/cli/dist/cli.js <falcon> <empire>` against all four fixtures and
  both error paths; confirm stdout values and exit codes.

## Notes
Rounding is `Math.round`; the README only says "a number ranging from 0 to 100" and shows `81`.
