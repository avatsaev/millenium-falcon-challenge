# Task 005 — `StarMap` + `MapDetails` panel wired into the page

- **Sprint:** sprint-002-universe-map
- **Status:** done
- **Type:** feature
- **Area:** packages/web
- **Priority:** P1
- **Estimated size:** M
- **Depends on:** task-004

## Goal
Render the universe as a static SVG panel with its details list, appended **below** the existing odds
display, without changing anything about how the odds themselves are presented.

## Context / why
The map exists to explain the number, never to replace it. README:109-112 grades the percentage; the map
is entirely our addition (`universe-map.md` §README authority), so the guard-rail is explicit: the odds
readout keeps its position and prominence, and the map goes underneath.

This feature introduces **no component state**. The page stays a pure function of the two query results:
one `useQuery` for the universe, the existing `useMutation` for the odds.

## Scope references
- `swe/specs/features/universe-map.md` § Behavior & algorithms (page states, star map rendering,
  details list, shell layout), § Error handling & edge cases
- `swe/specs/features/frontend-c3po.md` § Public contract, § Icon vocabulary
- `swe/specs/architecture/monorepo-tooling.md` § Component state, § Icons, § Styling
- Create: `packages/web/src/StarMap.tsx`, `packages/web/src/MapDetails.tsx`
- Modify: `packages/web/src/App.tsx`, `packages/web/src/App.test.tsx`

## What to build
- `<StarMap universe itinerary sightings />` — one `<svg viewBox="0 0 1000 620">`, `width: 100%`,
  positions from `layoutUniverse` (memoised on the universe object), painted back to front:
  1. **routes** — a line per route, `stroke-seam`, `{travelTime}d` label at the midpoint; routes in
     `planRouteKeys(itinerary)` drawn gold and thicker;
  2. **planets** — circle + name label; `departure` badged `Rocket`, `arrival` badged `Target`; any planet
     with a sighting gets a red ring, a `Crosshair` and its days listed (`d6, d7, d8`) — presence stated
     as fact from `empire.json`; planets in `planVisits` carry their day stamps so the journey reads
     without motion;
  3. **Falcon** — `Rocket` marker on the departure planet (day 0).
- `<MapDetails universe result />` — four blocks: mission (departure → arrival, autonomy, countdown,
  arrival day), plan (`<ol>`, one `<li>` per step via `describeStep`, omitted entirely when unreachable),
  hunter schedule (one row per watched planet with its days), off-map footnote (sightings whose planet is
  absent from `universe.planets`).
- `App.tsx` — additive only: add the `useQuery(["universe"])` read, widen the content column from
  `max-w-xl` to `max-w-5xl`, and append the map panel below the odds panel. Header, mission line, upload
  control and odds panel keep their order, markup and classes. Panel grid:
  `lg:grid-cols-[minmax(0,1fr)_18rem]` (map left, details right), single column below `lg`.
- Verification hooks, following the existing `data-tone` convention — assert on data attributes, never on
  class strings:

  | Element | Attributes |
  |---------|-----------|
  | `<svg>` | `data-testid="star-map"` |
  | planet `<g>` | `data-planet`, `data-role="departure\|arrival\|waypoint\|none"`, `data-hunters`, `data-visit-days` |
  | route `<line>` | `data-route="A\|B"` (sorted), `data-travel-time`, `data-on-plan` |
  | Falcon `<g>` | `data-testid="falcon"`, `data-planet` |
  | details blocks | `data-testid="mission" \| "plan" \| "hunters" \| "off-map-sightings"`; steps carry `data-step-day`, `data-action` |

- Page states per `universe-map.md`: universe loading → skeleton; loaded/no upload → universe drawn with
  the Falcon parked and a "Upload `empire.json` …" hint in the details list; universe failed → error text
  + `TriangleAlert` in place of the map, **odds flow still fully usable**; odds in flight → last good map,
  dimmed; unreachable → no highlighted route but hunter markers and countdown still shown.

## Out of scope
- Any change to the odds panel's markup, position, tone logic, icon or caption.
- New `@theme` tokens, new runtime dependencies, animation of any kind.
- Browser/E2E verification (task-006).

## Acceptance criteria
- [ ] Before any upload: all four fixture planets, all five routes with travel-time labels, `Tatooine`
      `data-role="departure"`, `Endor` `data-role="arrival"`, Falcon marker `data-planet="Tatooine"`.
- [ ] The three existing tone tests in `App.test.tsx` pass **unmodified** — same position, `data-tone`,
      colour, icon and caption.
- [ ] After uploading example2: exactly `Hoth|Tatooine` and `Endor|Hoth` have `data-on-plan="true"`;
      `Dagobah|Tatooine` does not.
- [ ] After example2: `Hoth` has `data-hunters="true"` with days `6, 7, 8`; `Tatooine`, `Dagobah`, `Endor`
      have `data-hunters="false"`.
- [ ] After example2: the plan list has 4 entries — parked Tatooine (day 0) → travel to Hoth (day 6) →
      refuel on Hoth (day 7) → travel to Endor (day 8).
- [ ] No plan entry contains a `%` or the word "captured".
- [ ] After example1: `0%`, no route with `data-on-plan="true"`, no `data-testid="plan"` block, hunter
      markers still present.
- [ ] A sighting on a planet absent from `universe.planets` produces no map node and appears in
      `data-testid="off-map-sightings"`.
- [ ] With `GET /api/universe` mocked to fail, the map area shows an error and uploading still yields the
      odds display.
- [ ] `/api/universe` is fetched exactly once per page load — not on window focus, not after an upload
      (React `StrictMode`'s double mount is deliberately uncounted, as today).
- [ ] Re-rendering with the same query results produces identical geometry (pure function, no state).

## Test / verification plan
- Tests: extend `packages/web/src/App.test.tsx` — add the map assertions alongside the existing tone
  tests (do not rewrite them). Stub `fetch` per the existing `jsonResponse` helper, adding an
  `/api/universe` route and widened odds payloads. Instantiate the shipped `createQueryClient()` so tests
  exercise the real retry/stale policy.
- Run: `pnpm --filter @falcon/web run test`, then `pnpm --filter @falcon/web run typecheck`.
- Delete, do not re-pin, any existing assertion that only encoded the old narrow `max-w-xl` column.

## Notes
- Icons: import named from `lucide-react` (`Rocket`, `Target`, `Crosshair`, `TriangleAlert`), size and
  colour from Tailwind utilities, `aria-hidden` on decorative ones.
- The map must never block or alter the odds display — if the universe request fails, the graded
  deliverable still works.
