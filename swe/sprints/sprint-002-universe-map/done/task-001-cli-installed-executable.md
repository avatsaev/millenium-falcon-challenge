# Task 001 — Make `give-me-the-odds` a real installed executable

- **Sprint:** sprint-002-universe-map
- **Status:** done
- **Type:** chore
- **Area:** packages/cli + repo root
- **Priority:** P1
- **Estimated size:** XS
- **Depends on:** none

## Goal
Close the one hard README gap in the repo: `$ give-me-the-odds <falcon.json> <empire.json>` must work as
an invocation, not just produce the right number when run through `node packages/cli/dist/cli.js`.

## Context / why
README:116-119 pins the CLI as an installed executable:

```sh
$ give-me-the-odds example2/millennium-falcon.json example2/empire.json
81
```

Verified state of the repo at planning time — the gap is narrower than `cli-r2d2.md` §TODO(verify)
originally claimed, so do not redo work that is already correct:

- `packages/cli/package.json` **already has** `"bin": { "give-me-the-odds": "./dist/cli.js" }`.
- `packages/cli/src/cli.ts` **already starts with** `#!/usr/bin/env node`, and `tsup` preserves it.
- `packages/cli/dist/cli.js` is already emitted with mode `755`.
- `command -v give-me-the-odds` → **not found**: nothing ever links the bin onto `PATH`.

So the missing pieces are the *install step* and the *documentation of it*. There is also no project
README at all (the repo's only `README.md` is the challenge brief), so a reviewer has no instructions to
install, build, run or test this implementation — tracked as a separate open question in `swe/PLAN.md`
and resolved here because the CLI invocation cannot be documented anywhere else.

## Scope references
- `swe/specs/features/cli-r2d2.md` § Public contract, § TODO(verify)
- `swe/specs/overview.md` § Open questions (Known README deviations)
- `packages/cli/package.json`, `package.json` (root)
- `CONTRIBUTING.md`/`README` decision: create `docs/README.md`? — **no**: create `SUBMISSION.md` at the
  repo root (the challenge brief owns `README.md` and must not be edited).

## What to build
- Root `package.json`: add a `link:cli` script that links the CLI bin globally via the workspace
  package manager, e.g. `pnpm --filter @falcon/cli exec pnpm link --global`. It must run **after**
  `pnpm run build`, since the bin target is `dist/cli.js`.
- `SUBMISSION.md` at the repo root — the reviewer-facing document that does not exist yet:
  - install: `pnpm install`
  - build: `pnpm run build`
  - install the CLI: `pnpm run link:cli`, then the exact README invocation and its `81` output
  - the `node packages/cli/dist/cli.js ...` fallback for anyone who does not want a global link
  - run the API: `FALCON_CONFIG_PATH=examples/example2/millennium-falcon.json node packages/api/dist/server.js`
  - run the frontend dev server: `pnpm run dev:web`
  - test/typecheck: `pnpm run test`, `pnpm run typecheck`
- `swe/specs/features/cli-r2d2.md`: replace §TODO(verify) with the resolved contract — the `bin` entry
  exists, `pnpm run link:cli` is the documented install step, `SUBMISSION.md` records it. Correct the
  spec's factual claim that a `bin` entry "needs" adding.
- `swe/specs/overview.md` § Open questions: mark the CLI deviation resolved by this task.

## Out of scope
- The AI-tool-usage disclosure required by README §Final note — it must be written in the submitter's
  own voice, so it stays an open question and is **not** authored here.
- Publishing to a registry, standalone single-file binaries, Docker, CI.
- Any change to CLI behaviour, output format, argv handling or exit codes.

## Acceptance criteria
- [x] `pnpm run build && pnpm run link:cli` succeeds from a clean checkout.
- [x] After linking, `command -v give-me-the-odds` resolves, and
      `give-me-the-odds examples/example2/millennium-falcon.json examples/example2/empire.json`
      prints exactly `81` — matching README:116-119 character for character in invocation shape.
- [x] The same invocation against example1/3/4 prints `0` / `90` / `100`.
- [x] `SUBMISSION.md` exists and its every command has been executed successfully as written.
- [x] The challenge `README.md` is unmodified (`git diff --stat README.md` is empty).
- [x] `cli-r2d2.md` no longer claims a `bin` entry is missing.

## Test / verification plan
- Build: `pnpm run build`.
- Link: `pnpm run link:cli`; then run the four fixture invocations above and diff each against the
  matching `examples/example*/answer.json` (0, 81, 90, 100).
- Error paths still intact: `give-me-the-odds` with no args prints usage to stderr and exits 1;
  with a nonexistent `empire.json` path prints a descriptive error and exits 1.
- Tests: `pnpm --filter @falcon/cli run test` (4 existing tests) stays green — no new tests, this task
  changes packaging, not behaviour.

## Notes
- Do not add a postinstall hook that links globally: it would fail in CI and in sandboxes without a
  writable global bin directory. An explicit, documented script is the honest contract.
- If `pnpm link --global` is unavailable in the target environment, document the exact fallback that was
  verified instead — the acceptance criterion is a working `give-me-the-odds` invocation, not a
  particular linker.
