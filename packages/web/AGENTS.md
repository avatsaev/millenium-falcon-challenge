# @falcon/web — C3PO, the graded single-page app

The SPA the README grades: upload `empire.json`, see the odds as a percentage. It reaches
`@falcon/api` over `/api` only — no `@falcon/core` import, no algorithm here — and nothing depends on
it. Never compute odds here, never persist state, never let the map degrade the odds readout.
Workspace-wide rules: [../../AGENTS.md](../../AGENTS.md).

**Guard-rail, first.** README:109-112 (`0%` / `x%` / `100%`) is the graded surface; in `App.tsx` that
is `OddsDisplay`, which keeps its position (first panel, `max-w-xl` column), `data-tone`, tone colour
+ icon, caption and prominence (`text-6xl` = 60 px vs `text-4xl` = 36 px for the `<h1>`, the largest
text elsewhere). The map is *additive*, below it, gated on `universe.data &&`, while `OddsDisplay`
depends only on the `odds` mutation — it can never block, delay or alter the odds. When
`GET /api/universe` fails, a `data-testid="universe-error"` panel replaces the map and upload → odds
still works (last test in `App.test.tsx`). Never rewrite the existing odds/tone assertions.

## Commands

| Command (`pnpm --filter @falcon/web run …`) | Runs |
|---|---|
| `dev` | `vite`; proxies `/api` to `VITE_API_PROXY_TARGET` or `http://localhost:4000` |
| `build` | `tsc --noEmit && vite build` |
| `preview` | `vite preview` |
| `test` | `vitest run` — jsdom, Vitest config inlined in `vite.config.ts` |
| `typecheck` | `tsc --noEmit`, TypeScript 7 native (`typescript: ^7.0.2`) |
| lint | root-level only: `pnpm run lint` runs ESLint over the workspace, and this package additionally gets `react-hooks` (`rules-of-hooks` + `exhaustive-deps`, both errors), browser globals and `no-console` |

React 19 (`createRoot` under `StrictMode`), Vite 6 + `@vitejs/plugin-react` + `@tailwindcss/vite`
(Tailwind 4), `@tanstack/react-query` 5, `lucide-react`, Vitest 3 + `@testing-library/react`.

## Layout

`src/` is grouped by boundary: the page shell at the root, everything that talks to the backend under
`api/`, the additive map panel and its pure derivations under `map/`.

| Path | Role |
|---|---|
| `src/main.tsx` | mounts `#root` (throws `root element not found` if absent), wraps `<App />` in `QueryClientProvider client={createQueryClient()}`, imports `./styles.css` |
| `src/App.tsx` | header, mission line, upload control, `OddsDisplay`, then the map/rail grid; owns the `TONE` record and `handleFileChange` |
| `src/App.test.tsx` | 9 tests: the odds/tone contract, the map wiring, the universe-failure panel, the focus-refetch count |
| `src/api/types.ts` | the wire shapes — `Universe`, `OddsResponse`, `ItineraryStep`; types only, so `map/` never imports a fetcher |
| `src/api/client.ts` | `fetchUniverse()`, `fetchOdds(File)`, `ApiError`, private `parseJsonOrThrow` |
| `src/api/query.ts` | `createQueryClient()` — one retry/stale policy, shared by app and tests |
| `src/api/guards.ts` | `isRecord`, the one permitted narrowing guard; sole consumer is `client.ts` |
| `src/map/StarMap.tsx` | the static `<svg viewBox="0 0 1000 620">`: routes, planets, badges, Falcon marker |
| `src/map/MapDetails.tsx` | the `18rem` rail: mission, plan, hunter schedule, off-map sightings |
| `src/map/layout.ts` | `layoutUniverse(planets, routes, options?)` — deterministic force layout |
| `src/map/plan.ts` | `routeKey`, `planRouteKeys`, `planVisits`, `sightingsByPlanet`, and `describeStep` (README-shaped prose for one step, never probability text) |
| `src/map/{layout,plan}.test.ts` | 8 + 7 tests; no DOM, no rendering |
| `src/styles.css` | the **only** raw CSS: `@import "tailwindcss"`; an `@theme` block declaring `--font-sans` and `--color-{void,hull,panel,seam,gold,starlight,dim,go,alert}`; an `@layer base` rule setting `html { color-scheme: dark }` and `body` min-height / radial-gradient background / colour / font. Nothing else |
| `src/test/setup.ts` | `import "@testing-library/jest-dom/vitest"` (Vitest `setupFiles`) |
| `Dockerfile` | `vite build` on `node:24-bookworm-slim` (installed with `--filter @falcon/web`, so no `@falcon/core` and no native addon) → static `dist` into `nginx:1.27-alpine`. **Build context is the repo root** |
| `nginx.conf` | Copied to `/etc/nginx/conf.d/default.conf`: immutable caching for `/assets/`, `no-store` for `index.html`, `proxy_pass http://api:4000` for `/api/`, `try_files … /index.html` SPA fallback |

Deleting the map is deleting `src/map/` plus its two callsites in `App.tsx`: nothing under `api/` or the
odds panel depends on it.

## Contracts and invariants

| Invariant | Rule |
|---|---|
| No component state | the page is a pure function of `useQuery(["universe"])` and `useMutation(fetchOdds)`; `StarMap`/`MapDetails` take props only — no `useState`, effect or motion |
| Query policy (`api/query.ts`) | `staleTime: Infinity` + `refetchOnWindowFocus: false` — the server reads `millennium-falcon.json` at startup, so a fetched universe cannot go stale and is fetched exactly once per page load (asserted); `retry: (n, e) => !(e instanceof ApiError) && n < 2` — an `ApiError` means the backend answered and rejected, so a retry re-fails; `mutations.retry: false` — never silently re-upload the user's file |
| `api/` mirrors the backend | `parseJsonOrThrow` checks `response.ok`, lifts `{ error }` into `ApiError(message)`, then casts `payload as T`; there is no runtime schema, so a new field on either endpoint stays invisible until `api/types.ts` is edited |
| Derivations memoised per universe | `StarMap` runs `useMemo(() => layoutUniverse(universe.planets, universe.routes, { padding: 90 }), [universe])` plus one `useMemo` each for `planRouteKeys`, `planVisits`, `sightingsByPlanet` — once per universe, not per render |
| `map/layout.ts` determinism is load-bearing | positions are *derived* because the routes DB has only `origin`/`destination`/`travel_time`: seeded `mulberry32`, fixed 400 iterations with no convergence exit, no `Math.random`/`Date.now`/`performance.now`/DOM measurement, input pre-sorted (`collectNames` sorts names, `layoutUniverse` sorts edges) so it is input-order independent, output `round2`-ed and clamped into the padded box by `fitToBox` |
| Accessibility | the upload control's accessible name is exactly `Upload empire.json` (`<label htmlFor="empire-file">`), the file input is `sr-only` and never `display: none` so it stays focusable, and every `lucide-react` icon carries `aria-hidden` because each restates adjacent text |

## Conventions

- Tailwind utilities only, as **literal** class strings — no interpolation into class names, no
  `@apply`, no new `@theme` tokens (Tailwind 4 scans source text, so a computed name is purged).
  Variant colours come from a `Record<Tone, …>` of full names — `TONE` in `App.tsx`: `text-go` +
  `ShieldCheck` (success), `text-gold` + `Crosshair` (warning), `text-alert` + `CircleOff` (danger).
- Icons: named imports from `lucide-react` (tree-shaken), sized `size-*`, coloured `text-*`.
- SVG size budget: the `1000×620` viewBox renders ≈758×470 CSS px beside the fixed `18rem` rail, so
  in-SVG sizes suit that downscale — `PLANET_RADIUS`/`ICON_SIZE` 30, `PLANET_LABEL_SIZE` 26,
  `ROUTE_LABEL_SIZE` 22, `HUNTER_DAYS_LABEL_SIZE` 20, `VISIT_STAMP_SIZE` 24 — and `{ padding: 90 }`
  (default `72`) keeps badges, day labels and the Falcon marker inside the viewBox.

## Testing

Assert data attributes and observable text — never Tailwind class strings, never implementation
detail. Fixture numbers are asserted against `examples/*/answer.json`, never copied literals. Hooks:

| Element | Attributes |
|---|---|
| `OddsDisplay` wrapper | `data-tone="success\|warning\|danger"` |
| universe-failure panel | `data-testid="universe-error"` |
| `<svg>` | `data-testid="star-map"` |
| planet `<g>` | `data-planet`, `data-role="departure\|arrival\|waypoint\|none"`, `data-hunters="true\|false"`, `data-visit-days` |
| route `<line>` | `data-route="A\|B"`, `data-travel-time`, `data-on-plan="true\|false"` |
| Falcon `<g>` | `data-testid="falcon"`, `data-planet` |
| rail sections | `data-testid="mission"`, `"plan"`, `"hunters"`, `"off-map-sightings"` |
| plan `<li>` | `data-step-day`, `data-action` |

- `App.test.tsx` stubs `fetch` through one `stubFetch({ routes?, universe?, odds? })` helper (which
  normalises `string | URL | Request` inputs — a bare `String(input)` on a `Request` yields
  `[object Object]` and silently matches nothing) and renders through the real `createQueryClient()` — e.g.
  *"highlights the canonical plan and the hunter planet on the map after uploading"* and *"does not
  refetch the mission when the window regains focus"* (counts `/api/universe` calls via `focusManager`).
- `map/layout.test.ts`: *"is input-order independent: shuffling planets and routes changes nothing"*,
  *"draws a longer route as strictly longer on screen: 6-day beats 1-day"*. `map/plan.test.ts`: *"is
  exactly the undirected edges the plan traverses, direction-independent"*, over an itinerary its
  comment records as taken from a live `@falcon/core` run, not hand-typed.
- jsdom is not the bar here: it loads no styles and lays out no SVG. Prominence, geometry and
  legibility must be verified in a real browser against a live API through the Vite proxy, examples 1-2.

## Traps

| Trap | Consequence |
|---|---|
| `routeKey` **sorts** its endpoints | the Tatooine↔Hoth edge is `data-route="Hoth\|Tatooine"`; a query for `"Tatooine\|Hoth"` silently matches nothing |
| planet `<g>` and Falcon `<g>` both carry `data-planet={departure}` | select planets as `[data-planet="X"][data-role]`, like the tests, or you get the marker |
| `data-visit-days` is always present, `""` when unvisited | assert its value, never its presence |
| `handleFileChange` clears `event.target.value` before mutating | that is what lets the same file re-fire `change`; drop the line and a repeat upload is a no-op |
| Any nondeterminism in the layout | `Math.random`, a time source, DOM measurement, an early convergence exit or dropping the input sort makes screenshots and `map/layout.test.ts` jitter |
| `tsconfig.json` has `"include": ["src"]` and is standalone | `vite.config.ts` is never typechecked (a proxy/`test`-block typo surfaces only at runtime), and the file does not extend `../../tsconfig.base.json` — it needs `lib: DOM`, `jsx: react-jsx`, `moduleResolution: Bundler` and repeats the strictness flags, so a base-config change never reaches this package |
| Imports are extensionless here | `moduleResolution: Bundler`, unlike `core`/`api`/`cli` (`NodeNext`, `.js` specifiers); a `.js` specifier copied in from those packages resolves anyway, so nothing fails — it just breaks the convention |
| The `/api` prefix is proxied **twice** | `vite.config.ts` proxies it in dev, `nginx.conf` in the image. A path or port change has to land in both, or dev works and the container 502s |

## Specs

- [`frontend-c3po.md`](../../swe/specs/features/frontend-c3po.md) — §Public contract, §Behavior & algorithms.
- [`universe-map.md`](../../swe/specs/features/universe-map.md) — §README authority, §Star map rendering, §Shell layout.
- [`graph-layout.md`](../../swe/specs/architecture/graph-layout.md) — §Determinism contract, §Geometric contract.
