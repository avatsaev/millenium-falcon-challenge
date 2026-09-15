# Task 006 — End-to-end verification against a live stack

- **Sprint:** sprint-002-universe-map
- **Status:** done
- **Type:** test
- **Area:** whole workspace
- **Priority:** P1
- **Estimated size:** S
- **Depends on:** task-005

## Goal
Prove the whole sprint in the real thing: a live API, the Vite dev server, a real browser, the built CLI,
and the workspace gates — then record the evidence and close out the specs.

## Context / why
Unit tests mock `fetch`; they cannot catch a payload/field mismatch between the Fastify handler and the
client, a dev-proxy misconfiguration, or a map that renders correctly in jsdom and collapses in a real
viewport. Sprint-001 was signed off with a real-browser run for the 0% / 81% / 100% states, and this
sprint must not lower that bar.

## Scope references
- `swe/specs/features/universe-map.md` § Acceptance criteria (last item)
- `swe/specs/features/frontend-c3po.md` § Acceptance criteria
- `swe/specs/features/backend-api.md`, `swe/specs/features/cli-r2d2.md`
- `swe/PLAN.md` § Status, § Open questions

## What to build
No product code. Execute the verification, then update documentation:
- Run the API against `examples/example2/millennium-falcon.json` and the Vite dev server proxying to it.
- Drive a real headless browser: load the page, then upload `examples/example1/empire.json` and
  `examples/example2/empire.json` through the actual file input.
- Capture a screenshot per state (idle, example1 → `0%`, example2 → `81%`).
- Confirm the CLI still satisfies README:116-119 after task-001, using the linked executable.
- Update `swe/PLAN.md` § Status with what was verified, and tick the acceptance criteria in
  `universe-map.md`, `frontend-c3po.md`, `backend-api.md` and `graph-layout.md`.
- Move each finished task file to `done/` with its summary, per the av-swe layout convention.

## Out of scope
- New product features, new unit tests (they belong to tasks 002-005), CI wiring, Docker.
- Authoring the AI-tool-usage disclosure — it stays an open question for the submitter's own voice.

## Acceptance criteria
- [ ] Idle load: the map shows four planets, five travel-time-labelled routes, `Tatooine` badged
      departure, `Endor` badged arrival, and the Falcon parked on `Tatooine` — screenshot captured.
- [ ] example2 upload: `81%` in its unchanged position and tone, `Hoth` ringed with days 6/7/8, the gold
      route `Tatooine → Hoth → Endor`, and a 4-step plan list — screenshot captured.
- [ ] example1 upload: `0%` with the unreachable caption, no gold route, hunter markers still present —
      screenshot captured.
- [ ] The odds percentage is visibly the most prominent element above the map in the real viewport
      (README:109-112 guard-rail holds in practice, not just in the spec).
- [ ] `give-me-the-odds examples/example{1,2,3,4}/millennium-falcon.json examples/example{1,2,3,4}/empire.json`
      prints `0` / `81` / `90` / `100` via the linked executable.
- [ ] `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/mission` → `404`.
- [ ] Workspace gates green: `pnpm run build`, `pnpm run typecheck`, `pnpm run test`.
- [ ] `swe/PLAN.md` § Status reflects this sprint, and every spec acceptance box this sprint delivered is
      ticked.

## Test / verification plan
- Build: `pnpm run build`.
- API: `FALCON_CONFIG_PATH=examples/example2/millennium-falcon.json node packages/api/dist/server.js`.
- Web: `pnpm run dev:web`; drive the page in a real browser, uploading real fixture files through the
  file input (not synthetic events on a mocked client).
- CLI: the four fixture invocations above.
- Gates: `pnpm run build && pnpm run typecheck && pnpm run test` — one run at the end, not per task.

## Notes
- Stop both servers when finished; leave no background processes running.
- If a screenshot shows the map crowding the percentage, the fix is layout in task-005's files, not a
  weakened acceptance criterion.
