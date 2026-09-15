# Millennium Falcon challenge — agent guide

Dataiku's "What are the odds?" technical test. `README.md` is the **challenge brief supplied by the
reviewer**: it is the grading contract, it is read-only, and `git diff README.md` must stay empty.
Everything in this repo exists to satisfy it. `SUBMISSION.md` is our reviewer-facing counterpart (run
instructions, design summary, AI-tool disclosure required by README:239).

Per-package guides carry the local detail: [packages/core](packages/core/AGENTS.md),
[packages/api](packages/api/AGENTS.md), [packages/cli](packages/cli/AGENTS.md),
[packages/web](packages/web/AGENTS.md).

## Non-negotiables

- **Three deliverables, all graded** (README:57): the backend onboard computer, the C3PO single-page
  frontend, the R2D2 CLI. None may be dropped or stubbed.
- **The four fixtures pin the algorithm.** `examples/example{1..4}/answer.json` are `0`, `0.81`, `0.9`,
  `1.0`. If a change moves any of them, the change is wrong — not the fixture. Assert against
  `answer.json`, never against a literal copied into a test.
- **CLI stdout is a bare integer** (README:116-119): `give-me-the-odds <falcon> <empire>` prints `81` and
  nothing else. No banner, no units, no extra flags.
- **The odds percentage is what gets graded** (README:109-112). It keeps its position, prominence, tone
  and caption; the star map is an additive panel *below* it and must never block, delay or alter it.
- **Clean cutover, no shims.** When a contract changes, every caller moves and the old path is deleted —
  `GET /api/mission` was removed outright rather than aliased when `/api/universe` superseded it.

## Layout

| Path | What |
|------|------|
| `packages/core` | `@falcon/core` — the only library: types, validating loaders, SQLite reader, graph, the odds DP |
| `packages/api` | `@falcon/api` — Fastify onboard computer; also serves the built SPA |
| `packages/cli` | `@falcon/cli` — the `give-me-the-odds` executable |
| `packages/web` | `@falcon/web` — C3PO SPA (React + Vite + Tailwind) |
| `examples/` | The README's four fixtures, plus `answer.json` per fixture |
| `swe/` | Plan and specs (see below) |
| `resources/` | Assets referenced by the brief |

Dependency direction is one-way and shallow: `api` and `cli` depend on `core`; `core` depends on nothing
in the workspace; **`web` depends on no workspace package at all** — it talks to the API over HTTP and
mirrors the payload types in `packages/web/src/api/types.ts`. Never import `@falcon/core` into `web`, and never
import an app from another app.

## Commands

Run from the repo root; each maps to the same script in every package.

| Command | Notes |
|---------|-------|
| `pnpm install` | pnpm 11 (`packageManager` pins it), Node 24 (`.nvmrc`, root `engines`) — pnpm 11 imports `node:sqlite`, so Node 20/22 cannot run it |
| `pnpm run build` | `core` first — `api`/`cli`/`web` resolve its `dist/*.d.ts` |
| `pnpm run typecheck` | TypeScript 7 in `web` (`--noEmit` only), 5.7 elsewhere (declaration emit) |
| `pnpm run test` | Vitest 3; 53 tests today (core 17, web 24, api 8, cli 4) |
| `docker compose up --build` | Two containers from the repo-root context: `packages/api/Dockerfile` (Fastify, `:4000`) and `packages/web/Dockerfile` (nginx serving the SPA, `:8080`, proxying `/api`). `UNIVERSE=./examples/exampleN` picks the mounted universe |
| `pnpm run lint` | **Aliases `tsc --noEmit`** — there is no ESLint/Biome. Do not claim "lint passes" as a style guarantee |
| `pnpm run link:cli` | `pnpm add -g .` in `packages/cli`, so `give-me-the-odds` lands on `PATH` |
| `pnpm run dev:api` | `tsx watch`; needs `FALCON_CONFIG_PATH` |
| `pnpm run dev:web` | Vite on `5173`, proxying `/api` to `http://localhost:4000` (`VITE_API_PROXY_TARGET` overrides) |
| CI | `.github/workflows/ci.yml` — every push to any branch: install → build → lint → test. Node and pnpm versions come from `.nvmrc` and `packageManager`, so bumping either moves CI too. Fork PRs do not run it (no `pull_request:` trigger) |

Scope to one package with `pnpm --filter @falcon/<name> run <script>` — prefer that while iterating, and
run the root gates once at the end.

Production shape (what a reviewer does): `pnpm run build`, then
`FALCON_CONFIG_PATH=examples/example2/millennium-falcon.json node packages/api/dist/server.js` and open
`http://localhost:4000` — the API serves `packages/web/dist`, so the whole app is one process.

## Conventions

- **Strict TypeScript, plus** `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch` (`tsconfig.base.json`). Indexed reads are `T | undefined`; handle it, do
  not cast it away.
- **ESM only** (`"type": "module"`). `core`/`api`/`cli` are `NodeNext`, so intra-package imports carry the
  `.js` specifier; `web` is `Bundler`, so its imports are extensionless. One convention per package.
- **Validate at the boundary, once.** Unknown input is narrowed by the local `guards.ts` and parsed by a
  loader that throws a typed error; downstream code receives `readonly` domain types and does not
  re-validate.
- **Tests assert observable behaviour.** DOM assertions go through `data-*` hooks and visible text, never
  Tailwind class strings. A test that pins wording, a default, or an implementation detail gets deleted
  rather than re-pinned.
- **Tailwind utilities only**, with literal class strings (no interpolation, no `@apply`) so nothing is
  purged. `packages/web/src/styles.css` is the only stylesheet: a `@theme` block declaring the palette and
  font tokens (`--color-gold`, `--color-panel`, …) plus an `@layer base` rule for `color-scheme: dark` and
  the body gradient. Colours belong in that token block, not in arbitrary hex utilities.
- **Docs move with the contract.** A change to the HTTP payload, the algorithm's semantics, or a graded
  display rule updates the governing spec in `swe/specs/` in the same change — and `SUBMISSION.md` too if
  it changes how the thing is run.

## Verification bar

Tool output is the proof; a passing unit test alone is not, where a real surface exists:

- **Algorithm / loaders** — the four fixtures via `answer.json`.
- **API** — `app.inject` for both payload shapes (JSON body and real multipart), plus a live server for
  anything about startup, static serving or ports.
- **CLI** — the built binary, invoked as the README writes it, across all four fixtures.
- **Frontend** — a real browser against a live API, not jsdom alone; jsdom cannot catch a payload/field
  mismatch, a proxy misconfiguration, or a map that collapses in a real viewport.

## Planning system (`swe/`)

The project is planned and executed with the [`av-swe`](https://github.com/avatsaev/av-swe-skill) agent
skill; read `skill://av-swe` before touching plan artifacts.

- `swe/PLAN.md` — single source of truth: strategy, task index, coverage, status, and § *Open questions*.
- `swe/specs/overview.md`, `swe/specs/features/*.md`, `swe/specs/architecture/*.md` — intent and
  acceptance criteria. Each package's guide names the specs that govern it.
- `swe/sprints/sprint-NNN-*/{backlog,in_progress,blocked,done}/` — a task's folder *is* its state; every
  finished task has a `done/task-NNN-*-summary.md` recording what changed and the command output that
  proved it.

Both sprints are complete. Do not invent tasks or sprints: unresolved judgement calls live in
`PLAN.md` § *Open questions* as decisions until the user picks one. Run `av-swe status` to orient.

## Traps

- `pnpm link --global` **does not exist in pnpm 11**. Use `pnpm run link:cli`; the global pnpm bin
  directory must be on `PATH` (`pnpm setup`). Rebuild before re-verifying the installed binary — the
  global bin points at `packages/cli/dist/cli.js`.
- The API listens on **4000**, not 3000. It has **no default config**: without `FALCON_CONFIG_PATH` it
  looks for `./millennium-falcon.json`, which does not exist at the repo root, and exits 1.
- `core` must be built before the others typecheck; downstream packages resolve its `dist/*.d.ts`, not its
  source.
- The API serves the SPA only if `packages/web/dist` exists — a stale or missing web build silently
  changes what `GET /` returns.
- `better-sqlite3` is a native module; `pnpm-workspace.yaml` allow-lists its build script. A fresh install
  that skips it will fail at runtime, not at typecheck. It is pinned `^13` on purpose: 11.x aborts the
  whole process (`Assertion failed: (env) != nullptr`) when V8 finalises a closed `Database` with no
  entered context, which reproduces on Node 24 inside a container. Never pin it back.
- In the container the SPA is served by **nginx on 8080**, not by Fastify — `packages/api/Dockerfile`
  ships no `packages/web/dist`, so `staticRoot` is absent there by design. Only the non-Docker
  `node packages/api/dist/server.js` path serves both from one origin.
