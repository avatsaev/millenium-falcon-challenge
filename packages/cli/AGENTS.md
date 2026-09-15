# @falcon/cli — R2D2, the graded `give-me-the-odds` executable

The third graded deliverable: a Node executable that prints the Falcon's odds of success as a bare
integer percentage. It consumes `@falcon/core` directly (no HTTP, no `@falcon/api`) and nothing
consumes it. Its stdout is a machine-read grading surface: `README.md:116-119` pins both the
invocation and the output, so this package must never print anything else on stdout.
Workspace-wide rules live in [../../AGENTS.md](../../AGENTS.md).

## Commands

| Command | What it does |
|---------|--------------|
| `pnpm --filter @falcon/cli run build` | tsup → `dist/cli.js` (+ `.map`), `clean: true` |
| `pnpm --filter @falcon/cli run dev` | `tsup --watch` |
| `pnpm --filter @falcon/cli run test` | `vitest run` (`src/**/*.test.ts`) |
| `pnpm --filter @falcon/cli run typecheck` | `tsc --noEmit`. Lint from the root (`pnpm run lint`) — there is no per-package `lint` script |

Install the executable from the repo root, **after** a full `pnpm run build`:

```sh
pnpm run build && pnpm run link:cli     # link:cli = pnpm --filter @falcon/cli exec pnpm add -g .
command -v give-me-the-odds             # e.g. ~/.local/share/pnpm/bin/give-me-the-odds
give-me-the-odds examples/example2/millennium-falcon.json examples/example2/empire.json   # -> 81
```

- `pnpm link --global` does **not** work here: pnpm 11 (`packageManager: pnpm@11.21.0`) removed it;
  `pnpm link` now takes only an explicit `<dir>` and has no `--global` flag. `pnpm add -g .` is the
  replacement — see `swe/sprints/sprint-002-universe-map/done/task-001-cli-installed-executable-summary.md`.
- The global pnpm bin directory must already be on `PATH` **before** installing: `pnpm add -g .` refuses
  outright (`ERROR The configured global bin directory "…/.local/share/pnpm/bin" is not in PATH`, exit 1)
  rather than installing something that would not resolve. Fix it once with `pnpm setup`, or export the
  path for the shell: `export PATH="$HOME/.local/share/pnpm/bin:$PATH"`.
- Fallback with no global install: `node packages/cli/dist/cli.js <falcon.json> <empire.json>`.

## Layout

| File | Role |
|------|------|
| `src/cli.ts` | Shell only: `#!/usr/bin/env node`, argv slicing, `console.log`/`console.error`, `process.exitCode`. `void main()` at the bottom. |
| `src/run.ts` | Pure logic: `computeOddsPercent(falconConfigPath, empireConfigPath): Promise<number>`. The single export. |
| `src/run.test.ts` | The four-fixture sweep against `examples/`. |
| `tsup.config.ts` | `entry: src/cli.ts`, `format: ["esm"]`, `target: node24`, `sourcemap`, `clean`, `external: ["better-sqlite3"]`. |

`package.json` declares `"bin": { "give-me-the-odds": "./dist/cli.js" }` and `"files": ["dist"]`.

## Contracts and invariants

- **Invocation:** exactly two positional arguments — the `millennium-falcon.json` path then the
  `empire.json` path. Relative paths resolve against the process CWD. `routes_db` inside the falcon
  config is resolved by `@falcon/core` relative to *that config file's* directory, not the CWD.
- **stdout:** one `console.log(oddsPercent)` — a single integer 0-100 plus a newline. No banner, no
  `%`, no label, no JSON.
- **No flags.** There is deliberately no `--json`, `--plan`, `--verbose` or `--help`; the only
  recognised shape is the two positionals. Adding output or flags breaks the pinned contract.
- **Exit codes**, exactly as coded in `src/cli.ts`:

  | Condition | stdout | stderr | exit |
  |-----------|--------|--------|------|
  | Both paths given, computation succeeds | `<0-100>\n` | — | 0 |
  | Either path missing or empty string | — | `Usage: give-me-the-odds <millennium-falcon.json> <empire.json>` | 1 |
  | Unreadable / invalid-JSON / schema-invalid config, or unopenable routes DB | — | the `InvalidConfigError` message, e.g. `could not read empire.json at "...": ENOENT...` | 1 |

- Unreachable mission is **success**, not an error: prints `0`, exits 0.
- Extra arguments beyond the first two are silently ignored (`process.argv.slice(2)` destructuring).
- Rounding is `Math.round(result.odds * 100)` and must stay identical to the API's
  (`packages/api/src/app.ts` `oddsPercent`), or the two deliverables disagree on the same fixture.

## Conventions

- Keep the `cli.ts` / `run.ts` split. All process interaction lives in `cli.ts`; everything testable
  lives in `run.ts`. This is why the tests need no `process.exit`, stdout or argv mocking — do not
  move logic into `cli.ts` and then reach for spies.
- `cli.ts` sets `process.exitCode` and returns; it never calls `process.exit()`.
- Errors are never constructed here — surface `@falcon/core`'s `InvalidConfigError` messages verbatim
  (`error instanceof Error ? error.message : String(error)`); no wrapping, no re-phrasing.
- ESM only, `.js` extensions on relative imports (`./run.js`).

## Testing

- `src/run.test.ts` — `describe("computeOddsPercent against the README examples")` with one case per
  fixture (`matches example1/answer.json` … `matches example4/answer.json`). `examplesDir` is resolved
  from `import.meta.url`, so tests are CWD-independent.
- Assert observable behaviour — the returned integer, stderr text, exit code — never internals.
- Fixture expectations are read from `examples/<name>/answer.json` by the local `expectedPercent()` helper
  (`Math.round(odds * 100)`), never copied literals — the same rule `packages/core/src/odds.test.ts`
  follows with `expectedOdds()`.
- Testing the installed executable is a manual step: rebuild, then run the four fixtures and both
  error paths, checking `$?`.

## Traps

- `dist/cli.js` is what the global bin points at (`pnpm add -g .` links the package dir). Source edits
  are invisible to `give-me-the-odds` until you rebuild — rebuild before re-verifying.
- `@falcon/core` and `better-sqlite3` are **not** bundled (tsup externalises deps). `dist/cli.js`
  imports `@falcon/core`, which resolves through the workspace `node_modules` symlink to
  `packages/core/dist/index.js`. Building only this package leaves a stale or missing core build;
  always build core too, and never delete workspace `node_modules` while relying on the global bin.
- The shebang lives in `src/cli.ts` line 1 and tsup preserves it into `dist/cli.js` (mode `755`).
  Anything prepended above it kills the executable.
- `loadRoutes` is synchronous and opens SQLite with `fileMustExist: true`; a wrong `routes_db` in
  the falcon config fails at open time (`could not open routes database at "..."`), not at query time.
- Any diagnostic you add must go to stderr; a stray `console.log` makes stdout unparseable.

## Specs

- `swe/specs/features/cli-r2d2.md` — § Public contract, § Behavior & algorithms, § Error handling,
  § Resolved (was TODO(verify)) for the install story.
- `swe/specs/architecture/odds-algorithm.md` — `computeOdds`, config loaders, `loadRoutes`.
- `swe/sprints/sprint-002-universe-map/done/task-001-cli-installed-executable-summary.md` — install
  transcript.
- `SUBMISSION.md` (repo root) — reviewer-facing run instructions; keep in sync with `link:cli`.
