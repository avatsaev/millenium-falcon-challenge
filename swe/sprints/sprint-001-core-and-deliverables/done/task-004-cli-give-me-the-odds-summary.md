# Task 004 — CLI: give-me-the-odds (R2D2) — Summary

- **Sprint:** sprint-001-core-and-deliverables
- **Completed:** 2026-09-08
- **Status:** done

## What was implemented
The `give-me-the-odds` executable: `computeOddsPercent` in `run.ts` (reusable/testable) and a thin
argv/exit-code shell in `cli.ts`.

## Files created / changed
| File | Change |
|------|--------|
| `packages/cli/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` | created |
| `packages/cli/src/run.ts` | created (`computeOddsPercent`) |
| `packages/cli/src/cli.ts` | created (shebang entrypoint, `bin: give-me-the-odds`) |
| `packages/cli/src/run.test.ts` | added 4 tests |

## How it satisfies the scope
Implements `swe/specs/features/cli-r2d2.md` § Public contract and § Behavior: two positional paths,
`Math.round(odds * 100)` on stdout, usage/errors on stderr with exit 1, and no dependency on the API.

## Build & test results
```
$ pnpm --filter @falcon/cli run test
 ✓ src/run.test.ts (4 tests) 5ms
 Test Files  1 passed (1) | Tests  4 passed (4)

$ for ex in example1 example2 example3 example4; do node packages/cli/dist/cli.js examples/$ex/millennium-falcon.json examples/$ex/empire.json; done
0
81
90
100

$ node packages/cli/dist/cli.js
Usage: give-me-the-odds <millennium-falcon.json> <empire.json>
exit=1

$ node packages/cli/dist/cli.js examples/example2/millennium-falcon.json /nonexistent.json
could not read empire.json at "/nonexistent.json": ENOENT: no such file or directory, open '/nonexistent.json'
exit=1
```

## Acceptance criteria
- [x] All four fixtures print `0`/`81`/`90`/`100` — matches the README exactly.
- [x] No args -> usage on stderr, exit 1.
- [x] Nonexistent path -> descriptive error on stderr, exit 1.
- [x] Unreachable mission prints `0` with exit 0.

## Follow-ups / TODO(verify)
- The README shows `$ give-me-the-odds ...` as if on `PATH`; it currently runs via
  `node packages/cli/dist/cli.js`. Tracked as sprint-002 task-001.
