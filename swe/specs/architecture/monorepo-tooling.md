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
| Source layout inside a package | `packages/core`/`api`/`cli` are flat `src/`. `packages/web` groups by boundary: entry + page shell at `src/` (`main.tsx`, `App.tsx`, `styles.css`), backend access in `src/api/` (`types.ts`, `client.ts`, `query.ts`, `guards.ts`), the additive map panel and its pure derivations in `src/map/`, the Vitest harness in `src/test/`. Tests sit next to the module they cover; no `__tests__` directory |
| Import specifiers | `core`/`api`/`cli` are `NodeNext`: intra-package imports carry `.js`. `packages/web` is `Bundler`: extensionless. One convention per package, no mixing |
| TypeScript version | `packages/web`: `typescript@7` (native compiler; `tsc --noEmit` only, no emit). `packages/core`/`api`/`cli` + root: `typescript@5.7` — they emit declarations through `tsup`, so they stay on 5.7 until that path is validated against 7 |
| Build tool per package | `tsup` for `packages/core`, `packages/api`, `packages/cli`; `vite build` for `packages/web` |
| Styling | `packages/web` only: Tailwind CSS 4 via the `@tailwindcss/vite` plugin. Design tokens live in `@theme` in `packages/web/src/styles.css`; components carry utility classes. No `.css` file per component, no `@apply` |
| Icons | `packages/web` only: `lucide-react`. Always import named icons (`import { Rocket } from "lucide-react"`) so Vite tree-shakes the rest of the pack; never `import * as icons`. Size and colour come from Tailwind utilities (`size-*`, `text-*`), not props. Decorative icons carry `aria-hidden` |
| Server state | `packages/web` only: TanStack Query. Reads are `useQuery`, writes are `useMutation`; no `useState`/`useEffect` fetch pairs. Retry and stale policy live in one place — `createQueryClient()` in `src/api/query.ts` — which both `main.tsx` and the tests instantiate |
| Component state | `packages/web` holds **no** client-side state machines: every view is a pure function of the query results. If that ever stops being true, the state belongs in a dedicated hook, not scattered through components |
| Pure derivations | Geometry and itinerary derivations are plain functions in their own modules (`src/map/layout.ts`, `src/map/plan.ts`), not component internals, so they are unit-testable without rendering |
| Root scripts | `build`, `test`, `typecheck` fan out via `pnpm -r --filter=./packages/* run <script>`. `lint` does **not** fan out: ESLint runs once at the root over the whole workspace, so packages carry no `lint` script |
| Native deps | `better-sqlite3` requires `pnpm-workspace.yaml`'s `allowBuilds` to include it (and `esbuild`) for postinstall scripts to run. Pinned `^13`: 11.x calls `node::RemoveEnvironmentCleanupHook` from `Database::~Database()`, which aborts the process (`Assertion failed: (env) != nullptr`) when V8 runs the finalizer with no entered context — reproducible on Node 24 |
| Node & package manager | `.nvmrc` and root `engines` pin Node **24**; `packageManager` pins pnpm 11. pnpm 11 imports `node:sqlite`, so it cannot run on Node 20 or 22. `tsup` targets `node24` in all three Node packages |
| Container images | `packages/api/Dockerfile` (Fastify on `node:24-bookworm-slim`, multi-stage, non-root, `HEALTHCHECK` on `GET /api/health`) and `packages/web/Dockerfile` (`vite build` → `nginx:1.27-alpine` with `packages/web/nginx.conf`). Both build from the **repo root** context. Root `docker-compose.yml` runs the pair, gating `web` on the API's health probe and mounting the universe read-only from `${UNIVERSE:-./examples/example2}` at `/config` |
| CI | `.github/workflows/ci.yml`, one `ubuntu-latest` job on every push to any branch: `pnpm install --frozen-lockfile` → `build` → `lint` → `typecheck` → `test`. pnpm comes from `packageManager` (`pnpm/action-setup`), Node from `.nvmrc` (`node-version-file`) — CI pins nothing itself. `build` is a prerequisite, not a gate: without `packages/core/dist`, downstream typechecking fails with `TS2307` on `@falcon/core`. Image builds are out of scope — nothing publishes them |
| Linting | ESLint 10 flat config (`eslint.config.mjs`) run as `eslint . --max-warnings=0`. Type-aware (`typescript-eslint` `recommendedTypeChecked` + project service, `tsconfigRootDir` at the repo root), plus `react-hooks` for `packages/web` and `no-console` there. **No formatting or stylistic rules and no Prettier** — layout is not litigated. Config files (`*.config.ts`) sit outside every `tsconfig`'s `include`, so they are linted with `disableTypeChecked` |

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

- None. The linter question is settled: ESLint 10 flat config at the root, type-aware, no formatting
  rules, `--max-warnings=0`, wired into the root `lint` script and CI.
