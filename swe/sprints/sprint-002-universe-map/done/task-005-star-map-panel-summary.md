# Task 005 — `StarMap` + `MapDetails` panel wired into the page — Summary

- **Sprint:** sprint-002-universe-map
- **Completed:** 2026-09-15
- **Status:** done

## What was implemented

- `packages/web/src/StarMap.tsx` (new) — one `<svg viewBox="0 0 1000 620" className="w-full">`, painted
  back to front exactly as `universe-map.md` §Star map rendering specifies:
  1. **Routes** — a `<line>` per route with `data-route` (endpoints sorted), `data-travel-time` and
     `data-on-plan`; on-plan edges (from `planRouteKeys`) drawn gold and thicker, others `stroke-seam`;
     `{travelTime}d` label at each midpoint.
  2. **Planets** — circle + name label per planet, wrapped in a `<g>` carrying `data-planet`,
     `data-role="departure|arrival|waypoint|none"`, `data-hunters` and `data-visit-days`. Departure is
     badged `Rocket`, arrival `Target`. Any planet with a sighting gets a red ring, a `Crosshair` and its
     days listed (`d6, d7, d8`). Planets the plan visits carry their day stamps (`0`, `6,7`, `8`).
  3. **Falcon** — a `Rocket` marker `<g data-testid="falcon" data-planet={departure}>` above the
     departure planet.
  Positions come from `layoutUniverse(planets, routes, { padding: 90 })`, memoised on the universe
  object; `planRouteKeys`/`planVisits`/`sightingsByPlanet` are memoised on their inputs. No component
  state, no animation — a pure function of `universe`, `itinerary` and `sightings`.
- `packages/web/src/MapDetails.tsx` (new) — the rail beside the map, four blocks per the spec's details
  table: `data-testid="mission"` (departure → arrival, autonomy, countdown, arrival day; the "Upload
  empire.json …" hint when no result yet), `data-testid="plan"` (`<ol>`, one `<li data-step-day
  data-action>` per step via `describeStep`, omitted entirely when `itinerary` is null),
  `data-testid="hunters"` (one row per watched planet with its days) and
  `data-testid="off-map-sightings"` (sightings whose planet is absent from `universe.planets`).
- `packages/web/src/App.tsx` — additive wiring only. The header, mission line, upload control and odds
  panel keep their order, markup, classes, `data-tone` and caption. Added below the odds panel:
  - `{universe.isError && <div data-testid="universe-error">}` — `TriangleAlert` + the error message
    **in place of the map**, so a failed universe load never blocks the graded odds flow;
  - `{universe.data && <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">}` — the map
    panel (dimmed via `opacity-50` while an odds request is in flight) left, `MapDetails` right;
  - `{universe.isLoading && <skeleton />}`.
  The content column was widened per the spec; it currently sits at `max-w-6xl` rather than the spec's
  `max-w-5xl` (see Deviations).
- `packages/web/src/App.test.tsx` — the four pre-existing tests (mission info, odds upload + tone
  caption, 400-rejection message, no refetch on focus) keep their assertions; only the `fetch` stub's
  universe payload was widened with `planets`/`routes` (the map crashes on a bare
  `{departure, arrival, autonomy}` mock) and the `getByText("Tatooine"/"Endor")` lookups were scoped
  with `{ selector: "strong" }`, since the star map now legitimately renders those same names as SVG
  `<text>` labels. Added a `universeResponse()` / `stubFetch()` helper pair and **five new tests**.

## Verification

- `pnpm --filter @falcon/web run typecheck` — clean.
- `pnpm --filter @falcon/web run test` — 24/24 passing (`App.test.tsx` 9, `layout.test.ts` 8,
  `plan.test.ts` 7).
- Full workspace: `pnpm run build`, `pnpm run typecheck`, `pnpm run test` — all green; 53 tests
  (core 17, web 24, cli 4, api 8).
- Acceptance criteria, each mapped to a test in `App.test.tsx`:
  - *"draws the universe before any upload"* — 4 planet `<g data-role>` nodes, 5 route nodes each with
    `data-travel-time`, `Tatooine` `data-role="departure"`, `Endor` `data-role="arrival"`, Falcon marker
    `data-planet="Tatooine"`.
  - *"highlights the canonical plan and the hunter planet on the map after uploading"* —
    `Hoth|Tatooine` and `Endor|Hoth` are `data-on-plan="true"`, `Dagobah|Tatooine` is `"false"`; `Hoth`
    is `data-hunters="true"` and renders `d6, d7, d8` while `Tatooine`/`Dagobah`/`Endor` are `"false"`;
    the plan list has exactly 4 items with the README-shaped prose and `data-action`
    `start → jump → refuel → jump`; every step is asserted free of `%` and "captured".
  - *"shows no highlighted route or plan list when the mission is unreachable…"* — `0%`, zero
    `[data-on-plan="true"]` nodes, no `data-testid="plan"` block, hunter marker still `true`.
  - *"lists an off-map sighting instead of drawing a phantom planet"* — a sighting on `Alderaan`
    produces no `[data-planet="Alderaan"]` node and appears in `data-testid="off-map-sightings"`.
  - *"shows an error in place of the map when the universe fails to load, without blocking the odds
    flow"* — a 500 on `GET /api/universe` renders `data-testid="universe-error"`, no `star-map`, and the
    subsequent upload still yields `81%`.
  - *"does not refetch the mission when the window regains focus"* (pre-existing) — exactly one
    `/api/universe` call per page load.
- Live browser verification against the running Vite dev server + Fastify API (`falcon-web`,
  `falcon-api`), example2's `empire.json` uploaded through the real file input: `81%` with its caption on
  top, the map below showing the gold `Tatooine → Hoth → Endor` route, day stamps `0` / `6,7` / `8`, the
  red hunter ring, `Crosshair` and `d6, d7, d8` on `Hoth`, and the rail listing the mission, the
  four-step plan and `Hoth — days 6, 7, 8`. Screenshots captured at both states.

## Deviations from the task file

- **Content column is `max-w-6xl`, not `max-w-5xl`.** The user, viewing the running app, reported the map
  and its labels were unreadably small and then explicitly asked for a bigger map viewport. The SVG only
  gets ~64% of the column width (it shares the row with the fixed `18rem` rail), so at `max-w-5xl` it
  rendered 630×390 CSS px for a 1000×620 user-unit canvas. Two changes followed:
  - the column was widened to `max-w-6xl`, taking the SVG to 758×470 px;
  - every in-SVG size was raised to survive that downscale (`PLANET_RADIUS` 30, `ICON_SIZE` 30, planet
    labels 26, route labels 22, hunter days 20, visit stamps 24 user units) and `layoutUniverse` is
    called with `padding: 90` so badges, day stamps and the Falcon marker cannot bleed outside the
    viewBox and get clipped.
  The guard-rail the spec actually protects is unaffected: the odds readout keeps its position, tone,
  icon, caption and prominence at the top of the page, and the map stays below it.
- **Added `data-testid="universe-error"`.** Not in the spec's hook table, but the failed-universe message
  is rendered in two places (the pre-existing mission-line error at the top, plus the new in-place-of-map
  block), so a bare `getByText` is ambiguous. Following the project's "assert on data attributes, never
  class strings" convention, the map-area block got its own hook.
- **Two `Rocket` icons appear on the departure planet** (the `departure` badge and the Falcon marker), as
  §Star map rendering items 2 and 3 both specify. They were briefly collapsed into one during the
  legibility work; the spec is explicit, so both were restored and verified not to overlap or clip.
