# Architecture — Monorepo tooling & package boundaries

> Part of: [../overview.md](../overview.md)
> Dependencies: none

## Purpose

Defines the pnpm workspace structure, build/test tooling, and package boundary rules every other
spec/task must follow so the monorepo stays consistent as it grows.

## Public contract

| Concern | Contract |
|---------|----------|
| Workspace globs | `pnpm-workspace.yaml`: `packages/*` (single flat tier — libraries and runnable apps alike) |
| Package names | Scoped `@falcon/<name>` for every internal package (`@falcon/core`, `@falcon/api`, `@falcon/cli`, `@falcon/web`) |
| Cross-package imports | Only via the published package name (`@falcon/core`), never relative paths crossing package boundaries |
| TS config | `tsconfig.base.json` at root; each Node package's `tsconfig.json` extends it; `packages/web` has its own standalone bundler-mode config (DOM libs, JSX) |
| TypeScript version | `packages/web`: `typescript@7` (native compiler; `tsc --noEmit` only, no emit). `packages/core`/`api`/`cli` + root: `typescript@5.7` — they emit declarations through `tsup`, so they stay on 5.7 until that path is validated against 7 |
| Build tool per package | `tsup` for `packages/core`, `packages/api`, `packages/cli`; `vite build` for `packages/web` |
| Styling | `packages/web` only: Tailwind CSS 4 via the `@tailwindcss/vite` plugin. Design tokens live in `@theme` in `packages/web/src/styles.css`; components carry utility classes. No `.css` file per component, no `@apply` |
| Icons | `packages/web` only: `lucide-react`. Always import named icons (`import { Rocket } from "lucide-react"`) so Vite tree-shakes the rest of the pack; never `import * as icons`. Size and colour come from Tailwind utilities (`size-*`, `text-*`), not props. Decorative icons carry `aria-hidden` |
| Server state | `packages/web` only: TanStack Query. Reads are `useQuery`, writes are `useMutation`; no `useState`/`useEffect` fetch pairs. Retry and stale policy live in one place — `createQueryClient()` in `src/query.ts` — which both `main.tsx` and the tests instantiate |
| Root scripts | `build`, `test`, `typecheck`, `lint` all fan out via `pnpm -r --filter=./packages/* run <script>` |
| Native deps | `better-sqlite3` requires `pnpm-workspace.yaml`'s `allowBuilds` to include it (and `esbuild`) for postinstall scripts to run |

## Behavior & algorithms

Not applicable (build/tooling configuration, not runtime logic).

## Data & persistence touchpoints

None.

## Error handling & edge cases

| Condition | Expected behavior |
|-----------|-------------------|
| A new internal package needs another internal package | add `"@falcon/<dep>": "workspace:*"` to its `dependencies`, never a relative `../` import across package roots |
| `packages/core` changes public API | must be rebuilt (`pnpm --filter @falcon/core run build`) before consumers' typecheck picks up the new `dist/index.d.ts` — `pnpm run build` already runs in dependency order |
| Adding a new native/postinstall dependency | must add it to `pnpm-workspace.yaml`'s `allowBuilds`, or `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS` |

## Dependencies on other specs

- None; every feature/architecture spec builds inside this structure.

## Acceptance criteria

- [x] `pnpm install` succeeds from a clean checkout.
- [x] `pnpm run build` builds all four packages, `packages/core` first.
- [x] `pnpm run typecheck` and `pnpm run test` pass across all four packages.

(Already satisfied by the current repo state — sprint-001 delivered this; tracked here so future
tasks know the ground rules, not because more work is needed.)

## TODO(verify)

- [ ] No ESLint/Biome config exists; `lint` scripts are currently `tsc --noEmit` aliases. Decide
      whether to add a real linter (see `overview.md`'s open questions) — if yes, this spec's
      contract table needs an update and a task should wire it into every package + root script.
