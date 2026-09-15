# Task 006 — Frontend SPA (C3PO)

- **Sprint:** sprint-001-core-and-deliverables
- **Status:** done
- **Type:** feature
- **Area:** packages/web
- **Priority:** P1
- **Estimated size:** M
- **Depends on:** task-005

## Goal
Ship the mandatory frontend deliverable: a single-page app to upload `empire.json` and display the
odds as a percentage.

## Context / why
The README's display contract is explicit: `0%` when unreachable, `x%` when reachable with exposure,
`100%` when reachable with none. The upload must go to the backend — the SPA never computes odds.

## Scope references
- `swe/specs/features/frontend-c3po.md` § Public contract, § Behavior & algorithms, § Error handling
- `packages/web/src/{api.ts,App.tsx,main.tsx,App.css,index.css}`, `packages/web/src/App.test.tsx`,
  `packages/web/vite.config.ts`, `packages/web/index.html`

## What to build
- `api.ts`: `fetchMission()`, `fetchOdds(file)` (multipart `POST /api/odds`), `ApiError` carrying the
  server's `error` message.
- `App.tsx`: fetch mission on mount into a banner; file input; discriminated `UploadState`
  (`idle | loading | success | error`); odds panel showing `{oddsPercent}%` with tone
  `success`/`warning`/`danger` for 100/middle/0 and a caption that pluralizes "occasion(s)" and
  reports unreachability.
- `vite.config.ts`: dev proxy `/api` -> `VITE_API_PROXY_TARGET` (default `http://localhost:4000`);
  jsdom Vitest setup.

## Out of scope
Design polish beyond the basic dark theme; itinerary visualization; client-side odds computation.

## Acceptance criteria
- [x] On load the banner shows departure/arrival/autonomy from the live API.
- [x] example1 upload -> `0%`, danger tone, unreachable caption.
- [x] example2 upload -> `81%`, warning tone, "2 occasions" caption.
- [x] example4 upload -> `100%`, success tone, "0 occasions" caption.
- [x] A failed `GET /api/mission` shows an error message instead of the banner.

## Test / verification plan
- Tests: `packages/web/src/App.test.tsx` (Testing Library + jsdom, mocked `fetch`) — 2 tests.
- Build: `pnpm --filter @falcon/web run build` (runs `tsc --noEmit` then `vite build`).
- Manual: real browser against a live Vite dev server proxying to a live Fastify API; upload each
  fixture through the actual file input and confirm rendered percentage, tone class, and caption.

## Notes
`event.target.value` is cleared after each selection so re-uploading the same file re-triggers change.
