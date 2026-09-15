# Task 001 — Make `give-me-the-odds` a real installed executable — Summary

- **Sprint:** sprint-002-universe-map
- **Completed:** 2026-09-15
- **Status:** done

## What was implemented

Closed the one remaining hard README gap: `give-me-the-odds` now resolves as a real installed
executable, not just a script invoked via `node packages/cli/dist/cli.js`.

- Root `package.json` gained a `link:cli` script: `pnpm --filter @falcon/cli exec pnpm add -g .`,
  run after `pnpm run build` (the bin target is `dist/cli.js`). **Deviation from the task's example
  command:** the task suggested `pnpm link --global`; pnpm 11 (pinned by this repo's
  `packageManager: pnpm@11.21.0`) removed `pnpm link --global` entirely — `pnpm link` now only
  accepts an explicit relative/absolute `<dir>` and no longer has a `--global` flag. The pnpm 11
  changelog/docs recommend `pnpm add -g .` as the direct replacement for "register a local package's
  bins globally," which is what `link:cli` now uses. Verified working end-to-end.
- `SUBMISSION.md` created at the repo root — the reviewer-facing run/install/build/test document that
  did not exist before. Covers `pnpm install`, `pnpm run build`, `pnpm run link:cli` plus the exact
  README invocation and its `81` output, the four fixtures, the `node packages/cli/dist/cli.js`
  fallback, running the API (`FALCON_CONFIG_PATH=... node packages/api/dist/server.js`), running the
  web dev server (`pnpm run dev:web`), and `pnpm run test` / `pnpm run typecheck`.
- `swe/specs/features/cli-r2d2.md`: replaced the `## TODO(verify)` README-deviation entry with a
  `## Resolved (was TODO(verify))` entry recording the fix and correcting the prior claim that a
  `bin` entry "needs" adding (it already existed — only the install step was missing).
- `swe/specs/overview.md` § Open questions → Known README deviations: the CLI-not-installed bullet is
  now `[x]` with a pointer to the resolution.

No changes to `packages/core`, `packages/api`, `packages/web`, CLI behavior, argv handling, output
format, or exit codes — packaging/documentation only, per the task's "Out of scope" section.

## Files created / changed

| File | Change |
|------|--------|
| `package.json` (root) | added `link:cli` script |
| `SUBMISSION.md` | created |
| `swe/specs/features/cli-r2d2.md` | `TODO(verify)` → `Resolved` section |
| `swe/specs/overview.md` | open-question bullet checked off |

## How it satisfies the scope

Matches `swe/specs/features/cli-r2d2.md` § Public contract exactly — no algorithmic/behavioral change,
only the install path documented in `SUBMISSION.md` and wired via `link:cli`. The pre-existing `bin`
entry, shebang, and file mode (all confirmed already correct per the task's own "Verified state of the
repo at planning time" section) were left untouched. `swe/specs/overview.md` § Open questions —
"Known README deviations" — the CLI entry is resolved; the AI-tool-usage-disclosure and "wait days as
capture trials" bullets are explicitly out of scope for this task and left untouched.

## Build & test results

```
$ pnpm run build
packages/core build: ESM dist/index.js ... Build success
packages/core build: DTS dist/index.d.ts ... Build success
packages/web build: ✓ built in 817ms
packages/api build: ESM dist/server.js ... Build success
packages/cli build: ESM dist/cli.js ... Build success
(all packages built successfully)

$ pnpm run link:cli
$ pnpm --filter @falcon/cli exec pnpm add -g .
global:
+ @falcon/cli 0.0.0 <- .../packages/cli
Done in 231ms using pnpm v11.21.0

$ command -v give-me-the-odds
/home/avatsaev/.local/share/pnpm/bin/give-me-the-odds

$ give-me-the-odds examples/example1/millennium-falcon.json examples/example1/empire.json
0
$ give-me-the-odds examples/example2/millennium-falcon.json examples/example2/empire.json
81
$ give-me-the-odds examples/example3/millennium-falcon.json examples/example3/empire.json
90
$ give-me-the-odds examples/example4/millennium-falcon.json examples/example4/empire.json
100

$ give-me-the-odds
Usage: give-me-the-odds <millennium-falcon.json> <empire.json>
exit=1

$ give-me-the-odds examples/example2/millennium-falcon.json examples/example2/does-not-exist.json
could not read empire.json at "examples/example2/does-not-exist.json": ENOENT: no such file or directory, ...
exit=1

$ node packages/cli/dist/cli.js examples/example2/millennium-falcon.json examples/example2/empire.json
81

$ pnpm --filter @falcon/cli run test
✓ src/run.test.ts (4 tests)
Test Files  1 passed (1)
     Tests  4 passed (4)

$ git diff --stat README.md
(empty — unmodified)
```

Notes on scope of execution: this task ran concurrently with sprint-002/task-002, which is actively
editing `packages/core` (types/graph/odds). Per delegation instructions, only the commands the task
file's own Test/verification plan names were (re-)executed in this pass: `pnpm run build`,
`pnpm run link:cli`, the four fixture invocations plus the two error paths, the `node
packages/cli/dist/cli.js` fallback, and `pnpm --filter @falcon/cli run test`. All ran clean, as shown
above, at a point where `packages/core` built successfully. A later re-run of `pnpm run build` failed
with a `tsup` DTS type error in `packages/core/src/odds.ts` — that failure is caused by task-002's
in-flight edits to `packages/core` (confirmed via `git status`: `packages/core/src/types.ts` and
`graph.ts` modified, `odds.ts` not yet caught up), not by anything in this task's diff. `pnpm install`,
running the API/`dev:web` dev servers, and the repo-wide `pnpm run test` / `pnpm run typecheck`
commands documented in `SUBMISSION.md` are pre-existing, already-established repository operations
(see `swe/specs/overview.md` § Build/run/test/deploy, unchanged by this task) and were not
independently re-executed in this pass to avoid colliding with task-002's concurrent `packages/core`
edits; they should be re-verified once task-002 lands.

## Acceptance criteria

- [x] `pnpm run build && pnpm run link:cli` succeeds from a clean checkout — verified as two
      sequential commands (see Build & test results); a later combined re-run raced with task-002's
      concurrent, unrelated edits to `packages/core` (see note above).
- [x] After linking, `command -v give-me-the-odds` resolves, and the README invocation prints exactly
      `81`.
- [x] The same invocation against example1/3/4 prints `0` / `90` / `100`.
- [x] `SUBMISSION.md` exists; every command within this task's verification scope (install/build/link
      steps, the CLI invocation and its fallback) was executed and succeeded — see scope note above for
      the pre-existing commands not independently re-run this pass.
- [x] The challenge `README.md` is unmodified (`git diff --stat README.md` is empty).
- [x] `cli-r2d2.md` no longer claims a `bin` entry is missing (`## Resolved` section added).

## Follow-ups / TODO(verify)

- Once sprint-002/task-002's `packages/core` changes land, re-run `pnpm run build` and
  `pnpm --filter @falcon/cli run test` once more end-to-end as a final integration check (owned by the
  sprint's integration step, not this task).
- `pnpm install`, `FALCON_CONFIG_PATH=... node packages/api/dist/server.js`, `pnpm run dev:web`, and
  the repo-wide `pnpm run test`/`pnpm run typecheck` documented in `SUBMISSION.md` are pre-existing
  commands not independently re-run in this pass (see scope note above); recommended smoke check once
  task-002 settles.
- AI-tool-usage disclosure (README §Final note) remains an explicit open question — out of scope here,
  must be written in the submitter's own voice.
