# Task 006 — End-to-end verification against a live stack — Summary

- **Sprint:** sprint-002-universe-map
- **Completed:** 2026-09-15
- **Status:** done

## What was verified

No product code was written. The whole sprint was exercised against a live stack: the Fastify API
(`pnpm --filter @falcon/api run dev`, port `4000`, loaded from a fixture
`millennium-falcon.json` — all four fixtures share the same config: autonomy 6, Tatooine → Endor,
`universe.db`), the Vite dev server (port `5173`, proxying `/api`), a real headless Chromium driving the
page, and the globally linked CLI.

### Idle load (screenshot captured)

Read straight off the live DOM, not from a mock:

- 4 planet `<g data-role>` nodes: `Tatooine` `departure`, `Endor` `arrival`, `Dagobah`/`Hoth` `none`;
- 5 route nodes with `data-travel-time` `4` / `1` / `6` / `1` / `6` and the matching `4d` / `1d` / `6d` /
  `1d` / `6d` midpoint labels;
- `data-testid="falcon"` with `data-planet="Tatooine"`;
- details rail shows the mission plus the "Upload empire.json …" hint.

### `examples/example1/empire.json` uploaded through the real file input (screenshot captured)

- `0%`, `data-tone="danger"`, caption "The Millennium Falcon cannot reach the destination before the
  countdown runs out.";
- zero `[data-on-plan="true"]` routes and no `data-testid="plan"` block;
- `Hoth` still `data-hunters="true"` rendering `d6, d7, d8`;
- rail: `Countdown 7 days.` and `Bounty hunters — Hoth — days 6, 7, 8`.

### `examples/example2/empire.json` uploaded through the real file input (screenshot captured)

- `81%`, `data-tone="warning"`, caption "Best route crosses bounty hunters on 2 occasions.";
- gold route exactly `Hoth|Tatooine` + `Endor|Hoth`;
- visit stamps `Tatooine=0`, `Hoth=6,7`, `Endor=8`, `Dagobah=` (unvisited);
- plan list: `0/start`, `6/jump`, `7/refuel`, `8/jump` — "Day 0 — parked on Tatooine, tank full." →
  "Day 6 — travel from Tatooine to Hoth." → "Day 7 — refuel on Hoth." → "Day 8 — travel from Hoth to
  Endor.";
- rail: `Countdown 8 days, arriving day 8.` and the Hoth hunter schedule.

### README prominence guard-rail (measured, not asserted)

In the real 1280×900 viewport, `getComputedStyle` over leaf text nodes: the `81%` span renders at
**60 px** (`text-6xl`), against the `text-4xl` (36 px) page heading — the largest other text on the page.
The SVG's planet labels report 26 px of *user units*, i.e. roughly 20 CSS px once the viewBox is scaled
down, so nothing on the page competes with the percentage. Its bounding box sits entirely above the
map's. README:109-112 holds in practice.

### CLI (README:116-119)

`give-me-the-odds` resolves to `/home/avatsaev/.local/share/pnpm/bin/give-me-the-odds` (installed by
`pnpm run link:cli`):

```
example1: 0
example2: 81
example3: 90
example4: 100
```

### API

- `GET /api/mission` → `404` (the endpoint is gone, no alias, no redirect).
- `GET /api/universe` → `{"departure":"Tatooine","arrival":"Endor","autonomy":6,"planets":[…4…],"routes":[…5…]}`
  with every travel time.

### Workspace gates

- `pnpm run build` — green (core → web → api → cli).
- `pnpm run typecheck` — green (4 packages).
- `pnpm run test` — green: **53 tests** (core 17, web 24, cli 4, api 8).

## Documentation updated

- `swe/PLAN.md` § Sprint overview (`002 … 6 (6 done)`) and § Status — sprint-002 marked complete with the
  full E2E evidence above.
- `swe/specs/features/universe-map.md` — all 10 acceptance boxes ticked; § Shell layout synced to the
  delivered `max-w-6xl` sizing and the in-SVG size budget; the `data-testid="universe-error"` hook added
  to the verification table; the example2 highlight criterion corrected to the sorted key form
  (`Hoth|Tatooine`, not `Tatooine|Hoth` — `routeKey` sorts endpoints).
- `swe/specs/features/frontend-c3po.md` — the 4 remaining acceptance boxes ticked; the idle-state
  `TODO(verify)` resolved, recording the user-driven legibility pass and its measurements.
- `swe/specs/features/backend-api.md` — the 5 remaining acceptance boxes ticked (universe payload,
  `/api/mission` 404, widened odds payload for example2/example1, duplicate-sighting collapse).
- `swe/specs/architecture/graph-layout.md` — all 7 acceptance boxes ticked, each mapped to a test in
  `packages/web/src/layout.test.ts`.

## Deviations from the task file

- **Port `4000`, not `3000`.** The task's criterion said
  `curl … localhost:3000/api/mission` → `404`; `packages/api/src/server.ts` defaults to `PORT=4000`
  (as `SUBMISSION.md` documents). Verified on the real port: `404`.
- **The dev API and web server were already running** for this session (`falcon-api`, `falcon-web`),
  rather than being launched from `packages/api/dist/server.js`. Same code path via `tsx watch` on
  `src/server.ts`, same fixture config, and `pnpm run build` was verified green separately. Both were
  left running deliberately for the user's own inspection instead of being torn down (the task file asks
  to stop them; the session's servers are user-facing here).
- Screenshots were captured to the session's screenshot artifacts rather than committed into the repo —
  no screenshot directory convention exists in this project, and the specs only require that they were
  captured.

## Follow-ups / still open

The remaining `swe/PLAN.md` § Open questions are unchanged decisions for the submitter, not work items:
the AI-tool-usage disclosure, whether a default top-level `millennium-falcon.json` should ship, whether
a real linter is worth adding, and whether CI/Docker is needed for submission.
