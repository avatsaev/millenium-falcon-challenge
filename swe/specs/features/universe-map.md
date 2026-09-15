# Feature — Universe map

> Part of: [../overview.md](../overview.md)
> Dependencies: [frontend-c3po.md](frontend-c3po.md), [backend-api.md](backend-api.md),
> [../architecture/odds-algorithm.md](../architecture/odds-algorithm.md),
> [../architecture/graph-layout.md](../architecture/graph-layout.md)

## Purpose

Give the user a **picture of the universe the odds were computed on**, so the percentage stops being an
unexplained number: the planets, the hyperspace routes and their travel times, where the Falcon starts,
which planets the Empire is watching and on which days, and the route the algorithm actually chose.

A **static** diagram, not an animation. It explains the number that is already on screen; it does not
replace it.

### README authority

`README.md` is the contract. This feature is **additive** and must never weaken it.

- The map is **not** a README requirement. The README asks for a single-page app that uploads
  `empire.json` and displays the odds as a percentage (README §Front-end). Everything here is extra.
- The **plan text is README-referenced**: each worked example reads "*The application should display 81%
  as The Millennium Falcon can go from Tatooine to Endor in 8 days with the following plan: …*"
  (README §Example 2). Whether that mandates rendering the plan or merely explains the expected answer to
  the reader is ambiguous, so the plan list is treated as *strongly suggested*, not as a gap being closed.

Guard-rails, which outrank every other decision in this spec:

| README demand | Where it is pinned | Guard-rail |
|---------------|--------------------|------------|
| Odds displayed as a percentage — `0%` / `x%` / `100%` (README:109-112) | [frontend-c3po.md](frontend-c3po.md) visual contract | the odds readout stays at the top of the page and remains its most prominent element; the map sits **below** it |
| SPA uploads `empire.json` (README §Front-end) | [frontend-c3po.md](frontend-c3po.md) | the upload control keeps its position, accessible name and behaviour |
| CLI prints a bare `0..100` integer (README:116-119) | [cli-r2d2.md](cli-r2d2.md) | `packages/cli` is not touched |
| Capture probability `1 - 0.9^k` (README:26-48) | [../architecture/odds-algorithm.md](../architecture/odds-algorithm.md) | the odds value is unchanged; only route reconstruction is added |
| Backend reads its config when it starts (README:61) | [backend-api.md](backend-api.md) | `GET /api/universe` serves startup state only; nothing becomes request-scoped |

The README names **no HTTP endpoints at all**, so replacing `GET /api/mission` with `GET /api/universe`
is internal design freedom, not a contract change.

If any decision here conflicts with the README, the README wins and this spec is what changes.

## Scope decisions (settled)

| Decision | Choice | Why not the alternative |
|----------|--------|-------------------------|
| Motion | **Static diagram.** The journey is legible from day-stamped waypoints along the route, not from a moving marker | A day timeline with playback added a clock, a scrub control, autoplay, reduced-motion handling and fractional-day interpolation — none of it required, all of it new failure surface |
| Placement | The odds headline keeps its existing position and prominence; the map is a panel **below** it, with the detail list to the **right of the map** | A two-pane app shell made the unrequested map the visual hero and demoted the one thing the README grades |
| Per-step risk wording | The plan list states **actions only** ("Refuel on Hoth", day-stamped). Bounty-hunter presence is shown as a **fact** from `empire.json` ("Hoth — days 6, 7, 8"). The encounter *count* stays in the existing, already-verified caption under the odds | Printing "10% chance of being captured" against each step asserts a rule the README does not state for idle days (see [../architecture/odds-algorithm.md](../architecture/odds-algorithm.md) §TODO(verify)). Dropping the per-step claim removes the ambiguity from the product entirely |
| Route drawn | The one canonical plan, chosen by a documented deterministic tie-break | Enumerating tied-optimal plans needs caps, dedup and plan-switch UI |
| Planet positions | Deterministic seeded force layout, spring length ∝ travel time (see [../architecture/graph-layout.md](../architecture/graph-layout.md)) | Layered ranks read as a chart; a graph library is 50 kB+ with its own styling opinions, for a 4-node graph |
| Decoration | None. No starfield, no gradients beyond the existing theme | Decorative surface that has to be maintained and screenshot-stabilised for no user value |
| Dependencies | **No new runtime dependency.** Hand-rolled SVG, `lucide-react` and Tailwind tokens already present | `reactflow` / `d3-force` / `cytoscape` |
| CLI | Unchanged | A `--plan` flag is outside the README's pinned CLI contract |

### Explicitly out of scope

Dropped from the earlier, more ambitious draft — not deferred, **removed**: day clock, play/pause,
day scrubber, autoplay-on-upload, reduced-motion motion handling, fractional-day Falcon interpolation,
`useDayClock.ts`, `TimelineControls.tsx`, per-step capture-probability text, starfield, and the
full-page two-pane shell rewrite.

## Public contract

### New/changed frontend modules (`packages/web/src/`)

| Module | Export | Contract |
|--------|--------|----------|
| `api/client.ts` | `fetchUniverse(): Promise<Universe>` | `GET /api/universe` → `{ departure, arrival, autonomy, planets, routes }` |
| `api/client.ts` | `fetchOdds(file: File): Promise<OddsResponse>` | unchanged call; response widened with `itinerary`, `arrivalDay`, `countdown`, `bountyHunters` |
| `map/layout.ts` | `layoutUniverse(planets, routes, options?): PlanetPositions` | pure, deterministic; see [../architecture/graph-layout.md](../architecture/graph-layout.md) |
| `map/plan.ts` | `planRouteKeys(itinerary): ReadonlySet<string>` | undirected `"A\|B"` keys of the edges the plan traverses |
| `map/plan.ts` | `planVisits(itinerary): ReadonlyMap<string, number[]>` | planet → the days the plan is there, for waypoint stamps |
| `map/plan.ts` | `describeStep(step): string` | README-shaped prose for one plan step, **no probability text** |
| `map/plan.ts` | `sightingsByPlanet(sightings): ReadonlyMap<string, number[]>` | planet → sorted hunter days |
| `map/StarMap.tsx` | `<StarMap universe itinerary sightings />` | the static SVG map |
| `map/MapDetails.tsx` | `<MapDetails universe result />` | the list beside the map |
| `App.tsx` | `<App />` | existing page, widened, with the map panel added below the odds |

`fetchMission` and `MissionInfo` are **deleted** — clean cutover, no alias.

### Data shapes consumed

```ts
interface Universe {
  departure: string; arrival: string; autonomy: number;
  planets: readonly string[];
  routes: readonly { origin: string; destination: string; travelTime: number }[];
}

interface OddsResponse {
  odds: number; oddsPercent: number; reachable: boolean;
  minRiskEncounters: number | null;
  arrivalDay: number | null;
  countdown: number;
  bountyHunters: readonly { planet: string; day: number }[];   // deduped, sorted
  itinerary: readonly ItineraryStep[] | null;
}
```

`ItineraryStep` mirrors `@falcon/core`'s shape as JSON:
`{ day, planet, action: "start"|"jump"|"wait"|"refuel", from, fuelAfter, huntersPresent }`.

`huntersPresent` is consumed only to mark a planet on the map, never to print a probability claim.

## Behavior & algorithms

### Page states

| State | Odds area (top) | Map panel (below) |
|-------|-----------------|-------------------|
| Universe loading | unchanged idle text | skeleton |
| Universe loaded, no upload yet | unchanged idle text | universe drawn: planets, routes, travel times, departure/arrival badges, Falcon on the departure planet. Details list shows the mission and "Upload `empire.json` to see the Empire's positions and the Falcon's route." |
| Universe load failed | unchanged; upload still works | error text + `TriangleAlert` in place of the map |
| Odds request in flight | existing spinner | last good map, dimmed |
| Odds returned, reachable | existing `{n}%` + tone + caption | route highlighted with day stamps, hunter planets marked, details list populated |
| Odds returned, unreachable | existing `0%` + unreachable caption | universe with **no** highlighted route; hunter planets still marked (this is *why* it failed); details list shows the countdown and hunter schedule, no plan |
| Odds request rejected (400) | existing API error text | last good map |

The map never blocks or alters the odds display. If the universe request fails, the odds still work.

### Star map rendering

One `<svg viewBox="0 0 1000 620">`, `width: 100%`, painted back to front:

1. **Routes** — every route as a line, `stroke-seam`, with a `{travelTime}d` label at its midpoint.
   Routes the plan traverses are drawn gold and thicker.
2. **Planets** — circle + name label. Badges: `departure` (`Rocket`), `arrival` (`Target`).
   A planet with any hunter sighting gets a red ring, a `Crosshair`, and its days listed (`d6, d7, d8`)
   — read straight from the uploaded file, stated as presence, not as risk.
   Planets the plan visits carry their day stamps (`6`, `7`) so the journey is readable without motion.
3. **Falcon** — `Rocket` marker on the departure planet: where the ship is on day 0.

Verification hooks follow the existing `data-tone` convention — assert on data attributes, never class
strings:

| Element | Attributes |
|---------|-----------|
| `<svg>` | `data-testid="star-map"` |
| planet `<g>` | `data-planet`, `data-role="departure\|arrival\|waypoint\|none"`, `data-hunters="true\|false"`, `data-visit-days` |
| route `<line>` | `data-route="A\|B"` (endpoints sorted), `data-travel-time`, `data-on-plan` |
| Falcon `<g>` | `data-testid="falcon"`, `data-planet` |
| universe-error panel `<div>` | `data-testid="universe-error"` — rendered in place of the map when `GET /api/universe` fails (the message also appears in the mission line, so a bare text query is ambiguous) |

### Details list (right of the map)

| Block | Content | Hook |
|-------|---------|------|
| Mission | departure → arrival, autonomy, countdown, arrival day | `data-testid="mission"` |
| Plan | `<ol>`, one `<li>` per itinerary step from `describeStep`; omitted entirely when unreachable | `data-testid="plan"`, `data-step-day`, `data-action` |
| Hunter schedule | one row per watched planet with its days | `data-testid="hunters"` |
| Off-map footnote | sightings whose planet is absent from `universe.planets`, if any | `data-testid="off-map-sightings"` |

`describeStep` mirrors the README's own wording, and stops there:

| Step | Prose |
|------|-------|
| `start` | `Day 0 — parked on Tatooine, tank full.` |
| `jump` | `Day 6 — travel from Tatooine to Hoth.` |
| `refuel` | `Day 7 — refuel on Hoth.` |
| `wait` | `Day 1 — wait on Tatooine.` |

No step carries a probability. The aggregate risk statement stays exactly where it already is and is
already verified: the existing caption under the percentage, *"Best route crosses bounty hunters on 2
occasions."*

### Shell layout

The page keeps its structure — header, mission line, upload control, odds panel — with the content column
at `max-w-6xl`. The map panel is appended below the odds panel:

```
map panel:  lg:grid-cols-[minmax(0,1fr)_18rem]    # map left, details right
            below lg: single column, map then details
```

The SVG shares that row with the fixed `18rem` rail, so its 1000×620-user-unit canvas renders about
758×470 CSS px. Every in-SVG size is set for that downscale: planet radius and icons 30 user units,
planet labels 26, route labels 22, hunter-day labels 20, visit stamps 24, with
`layoutUniverse(..., { padding: 90 })` reserving enough margin that badges, day stamps and the Falcon
marker cannot bleed outside the viewBox. The odds readout stays above the map and stays the most
prominent thing on the page: `text-6xl` (60 CSS px) against the `text-4xl` (36 px) page heading, with
every other text smaller still — the 26-unit planet labels render at roughly 20 CSS px.

Tailwind utilities only; no new `@theme` tokens.

## Data & persistence touchpoints

None client-side. `universe` is a TanStack Query query (`queryKey: ["universe"]`, `staleTime: Infinity`
— the server's config cannot change without a restart); the odds response stays a mutation (never
retried, never cached). `layoutUniverse` output is memoised on the universe. **No component state is
introduced by this feature** — the map is a pure function of the two query results.

## Error handling & edge cases

| Condition | Expected behavior |
|-----------|-------------------|
| `GET /api/universe` fails | map panel shows the error; the odds flow is unaffected and still fully usable |
| Unreachable mission (`itinerary: null`) | no highlighted route, no plan list; hunter markers and countdown still shown |
| Sighting on a planet not in `universe.planets` | excluded from the map (no phantom node), listed in the off-map footnote |
| Isolated departure/arrival (no routes) | layout still places them (`collectNames` keeps any planet named by `universe.planets`, and adds any endpoint named only by a route); drawn unconnected |
| Route list empty | planets drawn with no edges; the layout's spring pass handles zero edges |
| Duplicate sightings in `empire.json` | already collapsed server-side; one day chip each |
| Plan visits the same planet on several days | all its days appear in `data-visit-days` and as stacked stamps |

## Dependencies on other specs

- [backend-api.md](backend-api.md) — `GET /api/universe` and the widened `POST /api/odds` payload.
- [../architecture/odds-algorithm.md](../architecture/odds-algorithm.md) — the `itinerary`/`arrivalDay`
  fields and the canonical-plan tie-break this map draws.
- [../architecture/graph-layout.md](../architecture/graph-layout.md) — planet positions.
- [frontend-c3po.md](frontend-c3po.md) — the odds/tone/icon contract this feature leaves untouched.

## Acceptance criteria

- [x] Before any upload, the map shows all four fixture planets, all five routes with their travel-time
      labels, `Tatooine` badged departure, `Endor` badged arrival, and the Falcon marker on `Tatooine`.
- [x] The odds percentage, its tone and its caption render exactly as they do today, in the same
      position, with `data-tone` unchanged — verified by the existing tests, unmodified.
- [x] Uploading example2's `empire.json` highlights exactly `Hoth|Tatooine` and `Endor|Hoth` as
      `data-on-plan="true"` (keys are sorted endpoints), and does **not** highlight `Dagobah|Tatooine`.
- [x] With example2 loaded, `Hoth` carries `data-hunters="true"` with days `6, 7, 8`, and `Tatooine`,
      `Dagobah`, `Endor` carry `data-hunters="false"`.
- [x] With example2 loaded, the plan list has 4 entries: parked Tatooine (day 0) → travel to Hoth
      (day 6) → refuel on Hoth (day 7) → travel to Endor (day 8).
- [x] No entry in the plan list contains a percentage or the word "captured" — the ambiguous per-step
      risk claim is absent by construction.
- [x] Uploading example1's `empire.json` shows `0%`, no route marked `data-on-plan`, no plan list, and
      the hunter markers still present.
- [x] `GET /api/universe` is requested exactly once per page load — not refetched on focus or upload.
- [x] Rendering is a pure function of the two query results: re-rendering produces identical geometry
      (`layout.test.ts` pins determinism and input-order independence; no component state exists).
- [x] Verified in a real headless browser against a live API through the Vite proxy, for example1 and
      example2, plus a screenshot.

## TODO(verify)

- None. The three questions raised by the earlier animated draft (playback speed, reduced-motion
  behaviour, per-step risk wording) are removed along with the features that raised them.
