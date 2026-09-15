# Task 001 — Monorepo scaffold & build tooling — Summary

- **Sprint:** sprint-001-core-and-deliverables
- **Completed:** 2026-09-08
- **Status:** done

## What was implemented
A pnpm-workspace monorepo: `packages/*` + `packages/*` globs, a private root `package.json` whose
`build`/`test`/`typecheck`/`lint` scripts fan out via `pnpm -r --filter`, a strict shared
`tsconfig.base.json`, plus `.gitignore` and `.nvmrc`.

## Files created / changed
| File | Change |
|------|--------|
| `pnpm-workspace.yaml` | created (globs + `allowBuilds` for `better-sqlite3`, `esbuild`) |
| `package.json` | created (root, private, fan-out scripts, `packageManager: pnpm@11.21.0`) |
| `tsconfig.base.json` | created (ES2022/NodeNext, strict, `noUncheckedIndexedAccess`) |
| `.gitignore` | created |
| `.nvmrc` | created (Node 20) |

## How it satisfies the scope
Implements `swe/specs/architecture/monorepo-tooling.md` § Public contract: workspace globs, scoped
`@falcon/*` names, shared base tsconfig, per-package build tools, root fan-out scripts, and the
`allowBuilds` requirement for native postinstall scripts.

## Build & test results
```
$ corepack enable pnpm && pnpm -v
11.21.0

$ pnpm install
Done in 40.9s using pnpm v11.21.0
(better-sqlite3 compiled successfully via node-gyp; no ERR_PNPM_IGNORED_BUILDS)
```

## Acceptance criteria
- [x] `pnpm install` succeeds with no ignored-build errors (verified after moving `allowBuilds` into
      `pnpm-workspace.yaml` — pnpm 11 no longer reads `pnpm.onlyBuiltDependencies` from `package.json`).
- [x] Root scripts fan out to all workspace packages (verified by later `pnpm run build`/`test`).
- [x] `packages/core` builds before consumers (observed in `pnpm run build` output ordering).

## Follow-ups / TODO(verify)
- `lint` currently aliases `tsc --noEmit`; a real linter is deferred to sprint-003.
