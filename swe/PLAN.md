# Implementation Plan — Millennium Falcon Challenge

> Derived from the specs in `swe/specs/` and the existing source. Sprints and tasks are in
> implementation order. Execute with `av-swe implement`, one sprint at a time.
> **Version:** v2 · **Updated:** 2026-09-15

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

Sprint-002 adds the universe map. Its ordering is forced by data flow, not preference: the algorithm has
to remember the plan before the API can serve it, and the API has to serve it before the browser can draw
it. The one task that is independent of that chain — making the CLI a real installed executable — is
scheduled first, because it is the only outstanding gap against a hard README demand and it blocks
nothing.

## Sprint overview

| # | Sprint | Goal | Tasks |
|---|--------|------|-------|
| 001 | `sprint-001-core-and-deliverables` | All three README deliverables working end-to-end on a shared, tested algorithm | 6 (6 done) |
| 002 | `sprint-002-universe-map` | The CLI installable as the README specifies, and a static universe map explaining the odds | 6 (6 done) |

## Task index

### sprint-001-core-and-deliverables

| Task | Title | Type | Area | Depends on | Covers (specs + source) |
|------|-------|------|------|-----------|------------------------|
| task-001 | Monorepo scaffold & build tooling | chore | tooling | none | `specs/architecture/monorepo-tooling.md` · `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json` |
| task-002 | Core domain types, config loaders & routes DB reader | feature | packages/core | task-001 | `specs/overview.md` §Data model · `packages/core/src/{types,errors,guards,config,routes-db}.ts` |
| task-003 | Graph builder & DP odds-of-success algorithm | feature | packages/core | task-002 | `specs/architecture/odds-algorithm.md` · `packages/core/src/{graph,odds}.ts` |
| task-004 | CLI: give-me-the-odds (R2D2) | feature | packages/cli | task-003 | `specs/features/cli-r2d2.md` · `packages/cli/src/{run,cli}.ts` |
| task-005 | Backend API (onboard computer) | feature | packages/api | task-003 | `specs/features/backend-api.md` · `packages/api/src/{app,server}.ts` |
| task-006 | Frontend SPA (C3PO) | feature | packages/web | task-005 | `specs/features/frontend-c3po.md` · `packages/web/src/{api/,App.tsx,main.tsx}` |

### sprint-002-universe-map

| Task | Title | Type | Area | Depends on | Covers (specs + source) |
|------|-------|------|------|-----------|------------------------|
| task-001 | Make `give-me-the-odds` a real installed executable | chore | packages/cli + root | none | `specs/features/cli-r2d2.md` §TODO(verify) · `packages/cli/package.json`, root `package.json`, new `SUBMISSION.md` |
| task-002 | Itinerary reconstruction in `computeOdds` | feature | packages/core | none | `specs/architecture/odds-algorithm.md` §Itinerary reconstruction · `packages/core/src/{odds,graph,types,index}.ts` |
| task-003 | `GET /api/universe` + widened odds payload | feature | packages/api | task-002 | `specs/features/backend-api.md` §Public contract · `packages/api/src/{app,app.test}.ts` |
| task-004 | Web API client cutover + `layout.ts` / `plan.ts` | feature | packages/web | task-003 | `specs/architecture/graph-layout.md` · `packages/web/src/api/*`, `packages/web/src/map/{layout,plan}.ts` |
| task-005 | `StarMap` + `MapDetails` panel wired into the page | feature | packages/web | task-004 | `specs/features/universe-map.md` §Behavior · `packages/web/src/map/{StarMap,MapDetails}.tsx`, `src/App.tsx` |
| task-006 | End-to-end verification against a live stack | test | workspace | task-005 | all sprint-002 specs §Acceptance criteria |

## Coverage check

Every spec is covered by at least one task; no task depends on a later task. Task ids restart at 001 in
each sprint (per the av-swe layout convention), so they are qualified `s001`/`s002` below.

| Spec / module | Covered by |
|---------------|-----------|
| `specs/architecture/monorepo-tooling.md` | s001/task-001 |
| `specs/architecture/odds-algorithm.md` | s001/task-002, s001/task-003, s002/task-002 |
| `specs/architecture/graph-layout.md` | s002/task-004 |
| `specs/features/cli-r2d2.md` | s001/task-004, s002/task-001 |
| `specs/features/backend-api.md` | s001/task-005, s002/task-003 |
| `specs/features/frontend-c3po.md` | s001/task-006, s002/task-004, s002/task-005 |
| `specs/features/universe-map.md` | s002/task-004, s002/task-005, s002/task-006 |
| `packages/core` | s001/task-002, s001/task-003, s002/task-002 |
| `packages/cli` | s001/task-004, s002/task-001 |
| `packages/api` | s001/task-005, s002/task-003 |
| `packages/web` | s001/task-006, s002/task-004, s002/task-005 |

## Status

Sprint-001 is complete: 18 tests passing across 4 packages, `pnpm run build`/`typecheck`/`test` all
green, plus end-to-end verification of the built CLI against all four fixtures, a live API exercised
with `curl` (JSON body, real multipart upload, 400 path), and a real-browser run of the SPA against a
live API for the 0% / 81% / 100% display states.

**Sprint-002 is complete** (all 6 tasks in `swe/sprints/sprint-002-universe-map/done/`, each with its
summary). 53 tests passing across 4 packages (core 17, web 24, cli 4, api 8); `pnpm run build`,
`pnpm run typecheck` and `pnpm run test` all green. What landed:

- the CLI is a real installed executable (`pnpm run link:cli`), with `SUBMISSION.md` documenting the
  install/run/build/test path;
- `computeOdds` reconstructs the canonical itinerary and arrival day — every odds value unchanged, all
  four fixture answers still exact;
- `GET /api/universe` replaces `GET /api/mission` (which now 404s) and the odds payload echoes the
  countdown, normalised hunter schedule and itinerary;
- `map/layout.ts` / `map/plan.ts` provide the deterministic seeded force layout and the pure plan derivations;
- `StarMap` + `MapDetails` render the static universe panel below the odds, with the odds readout's
  position, tone, icon and caption untouched.

End-to-end verification (s002/task-006), against a live Fastify API on `:4000` and the Vite dev server
on `:5173`, driving a real headless browser and uploading the actual fixture files through the page's
file input:

- idle load — 4 planets, 5 travel-time-labelled routes (`4d`/`1d`/`6d`/`1d`/`6d`), `Tatooine`
  `data-role="departure"`, `Endor` `data-role="arrival"`, Falcon parked on `Tatooine`;
- `examples/example1/empire.json` — `0%`, `data-tone="danger"`, unreachable caption, zero
  `data-on-plan="true"` routes, no plan block, `Hoth` still ringed with `d6, d7, d8`;
- `examples/example2/empire.json` — `81%`, `data-tone="warning"`, caption "Best route crosses bounty
  hunters on 2 occasions.", gold route `Hoth|Tatooine` + `Endor|Hoth`, day stamps `Tatooine=0`,
  `Hoth=6,7`, `Endor=8`, and the 4-step plan (parked d0 → travel to Hoth d6 → refuel d7 → travel to
  Endor d8);
- README guard-rail measured in the real viewport, not asserted: the percentage renders at 60 px
      (`text-6xl`) against the 36 px page heading, and the readout sits above the map;
- `give-me-the-odds examples/example{1..4}/…` via the linked executable → `0` / `81` / `90` / `100`;
- `GET /api/mission` → `404`.

Screenshots were captured for all three display states (idle, `0%`, `81%`).

The items below are **decisions, not scheduled work** — they are deliberately not turned into tasks until
you choose to act on one.

## Open questions — TODO(verify)

- [ ] **AI-tool disclosure.** `README.md` § Final note requires stating which AI tool was used and
      why. Not yet written anywhere in the repo; should be authored in the submitter's own voice.
- [x] **CLI on `PATH`** — scheduled as s002/task-001. The `bin` entry and shebang already exist and
      `dist/cli.js` is emitted executable; only the install step was missing, so the task adds a
      `link:cli` root script and documents the verified invocation.
- [x] **No project README / run instructions** — scheduled as s002/task-001, which creates
      `SUBMISSION.md` (the challenge `README.md` is the brief and stays untouched).
- [ ] **No default top-level `millennium-falcon.json` / `universe.db`.** The API and CLI always need
      an explicit path (`FALCON_CONFIG_PATH` or argv); only `examples/*` fixtures exist. Decide
      whether a default config should ship at the repo root.
- [ ] **No real linter.** `lint` scripts alias `tsc --noEmit`; no ESLint/Biome config exists. Decide
      whether a linter is worth adding before submission (would also update
      `specs/architecture/monorepo-tooling.md`'s contract table).
- [x] **Containers.** `packages/api/Dockerfile` + `packages/web/Dockerfile` + root `docker-compose.yml`
      ship the stack as two services (Fastify, and nginx serving the SPA and proxying `/api`), with the
      universe mounted from `${UNIVERSE:-./examples/example2}`. Verified end to end: both containers
      healthy, `81%`/`90%`/`100%` through the proxy, and a real browser upload against
      `http://localhost:8080`. **CI is still unspecified** — no workflow exists; decide whether the
      submission needs one.
- [x] **Itinerary output** — scheduled as s002/task-002: `computeOdds` now returns the canonical plan and
      arrival day. The README does not demand it, but the universe map is built on it and the README's
      worked examples pin the expected plans exactly.
