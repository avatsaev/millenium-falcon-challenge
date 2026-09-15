# Task 001 — Monorepo scaffold & build tooling

- **Sprint:** sprint-001-core-and-deliverables
- **Status:** done
- **Type:** chore
- **Area:** tooling
- **Priority:** P1
- **Estimated size:** S
- **Depends on:** none

## Goal
Stand up a pnpm workspace monorepo with shared TypeScript config and per-package build/test tooling
so every later task lands in a buildable, testable skeleton.

## Context / why
Three deliverables (backend, frontend, CLI) must share one odds algorithm. A workspace with a shared
`@falcon/core` package is what makes that sharing possible without duplicating the algorithm or
crossing package boundaries with relative imports.

## Scope references
- `swe/specs/overview.md` § Tech stack & runtime requirements, § Module / directory map
- `swe/specs/architecture/monorepo-tooling.md` § Public contract
- `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc`

## What to build
- Create: `pnpm-workspace.yaml` (glob `packages/*`), root `package.json` (private, fan-out
  `build`/`test`/`typecheck`/`lint` scripts via `pnpm -r --filter`), `tsconfig.base.json` (strict,
  `NodeNext`, `noUncheckedIndexedAccess`), `.gitignore`, `.nvmrc`.
- `pnpm-workspace.yaml` must set `allowBuilds` for `better-sqlite3` and `esbuild` so native/postinstall
  scripts run.

## Out of scope
Package contents (later tasks), linters, CI, Docker.

## Acceptance criteria
- [x] `pnpm install` succeeds from a clean checkout with no ignored-build errors.
- [x] Root `build`/`test`/`typecheck`/`lint` scripts fan out to all workspace packages.
- [x] `packages/core` is built before its consumers by workspace dependency order.

## Test / verification plan
- Install: `pnpm install` succeeds.
- Build: `pnpm run build` succeeds once packages exist.

## Notes
`corepack enable pnpm` is required on a fresh machine; Node >= 20 is assumed (`.nvmrc` pins 20).
