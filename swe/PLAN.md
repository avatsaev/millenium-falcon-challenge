# Implementation Plan — Millennium Falcon Challenge

> Derived from the specs in `swe/specs/` and the existing source. Sprints and tasks are in
> implementation order. Execute with `av-swe implement`, one sprint at a time.
> **Version:** v1 · **Updated:** 2026-09-08

## Strategy

Bottom-up: the workspace scaffold comes first so everything after it is buildable and testable; then
the shared domain layer (`@falcon/core` types, validating loaders, SQLite reader); then the odds
algorithm that all three deliverables share; then the three README-mandated deliverables themselves
(CLI, backend, frontend) in dependency order — CLI and backend both need only the algorithm, while
the frontend needs the backend's HTTP contract to exist first.

This ordering means the riskiest, most-specified thing (the algorithm, pinned exactly by the four
`examples/*/answer.json` fixtures) is proven before any surface is built on top of it, and each
deliverable is verifiable against the README the moment it lands.

Layout note: all four workspace members live in a single flat `packages/*` tier (`packages/core` is
the only library; `api`/`cli`/`web` are the runnable deliverables). Sprints live under
`swe/sprints/` — recorded as a `layout.sprintsDir` override in `swe/av-swe.config.json`.

## Sprint overview

| # | Sprint | Goal | Tasks |
|---|--------|------|-------|
| 001 | `sprint-001-core-and-deliverables` | All three README deliverables working end-to-end on a shared, tested algorithm | 6 (6 done) |

## Task index

### sprint-001-core-and-deliverables

| Task | Title | Type | Area | Depends on | Covers (specs + source) |
|------|-------|------|------|-----------|------------------------|
| task-001 | Monorepo scaffold & build tooling | chore | tooling | none | `specs/architecture/monorepo-tooling.md` · `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json` |
| task-002 | Core domain types, config loaders & routes DB reader | feature | packages/core | task-001 | `specs/overview.md` §Data model · `packages/core/src/{types,errors,guards,config,routes-db}.ts` |
| task-003 | Graph builder & DP odds-of-success algorithm | feature | packages/core | task-002 | `specs/architecture/odds-algorithm.md` · `packages/core/src/{graph,odds}.ts` |
| task-004 | CLI: give-me-the-odds (R2D2) | feature | packages/cli | task-003 | `specs/features/cli-r2d2.md` · `packages/cli/src/{run,cli}.ts` |
| task-005 | Backend API (onboard computer) | feature | packages/api | task-003 | `specs/features/backend-api.md` · `packages/api/src/{app,server}.ts` |
| task-006 | Frontend SPA (C3PO) | feature | packages/web | task-005 | `specs/features/frontend-c3po.md` · `packages/web/src/{api.ts,App.tsx,main.tsx}` |

## Coverage check

Every spec is covered by at least one task; no task depends on a later task.

| Spec / module | Covered by |
|---------------|-----------|
| `specs/architecture/monorepo-tooling.md` | task-001 |
| `specs/architecture/odds-algorithm.md` | task-002, task-003 |
| `specs/features/cli-r2d2.md` | task-004 |
| `specs/features/backend-api.md` | task-005 |
| `specs/features/frontend-c3po.md` | task-006 |
| `packages/core` | task-002, task-003 |
| `packages/cli` | task-004 |
| `packages/api` | task-005 |
| `packages/web` | task-006 |

## Status

Sprint-001 is complete: 18 tests passing across 4 packages, `pnpm run build`/`typecheck`/`test` all
green, plus end-to-end verification of the built CLI against all four fixtures, a live API exercised
with `curl` (JSON body, real multipart upload, 400 path), and a real-browser run of the SPA against a
live API for the 0% / 81% / 100% display states.

No further sprint is planned. The items below are **decisions, not scheduled work** — they are
deliberately not turned into sprints/tasks until you choose to act on one.

## Open questions — TODO(verify)

- [ ] **AI-tool disclosure.** `README.md` § Final note requires stating which AI tool was used and
      why. Not yet written anywhere in the repo; should be authored in the submitter's own voice.
- [ ] **CLI on `PATH`.** The README shows `$ give-me-the-odds ...` as if installed; today it runs via
      `node packages/cli/dist/cli.js ...`. Decide between `pnpm link --global`, documenting the
      `node ...` invocation, or shipping a standalone bundled binary.
- [ ] **No project README / run instructions.** The repo's only `README.md` is the challenge brief;
      there is no document telling a reviewer how to install, build, run, and test this
      implementation.
- [ ] **No default top-level `millennium-falcon.json` / `universe.db`.** The API and CLI always need
      an explicit path (`FALCON_CONFIG_PATH` or argv); only `examples/*` fixtures exist. Decide
      whether a default config should ship at the repo root.
- [ ] **No real linter.** `lint` scripts alias `tsc --noEmit`; no ESLint/Biome config exists. Decide
      whether a linter is worth adding before submission (would also update
      `specs/architecture/monorepo-tooling.md`'s contract table).
- [ ] **No CI workflow or Dockerfile.** Deployment/CI story is unspecified; flag if the submission
      needs one.
- [ ] **Itinerary output.** `computeOdds` returns only the minimum encounter count, not the route
      achieving it. The README does not ask for the itinerary, so this is deliberately out of scope —
      revisit only if a "show the plan" feature is wanted.
