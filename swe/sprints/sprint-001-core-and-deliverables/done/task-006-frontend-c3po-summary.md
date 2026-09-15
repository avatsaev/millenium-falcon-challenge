# Task 006 — Frontend SPA (C3PO) — Summary

- **Sprint:** sprint-001-core-and-deliverables
- **Completed:** 2026-09-08
- **Status:** done

## What was implemented
A React 19 + Vite 6 single-page app: a typed API client, a mission banner, an `empire.json` upload
control, and a tone-coded odds panel.

## Files created / changed
| File | Change |
|------|--------|
| `packages/web/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` | created |
| `packages/web/src/api.ts` | created (`fetchMission`, `fetchOdds`, `ApiError`) |
| `packages/web/src/App.tsx` | created (mission banner, upload, `OddsDisplay`) |
| `packages/web/src/main.tsx`, `src/index.css`, `src/App.css` | created |
| `packages/web/src/test/setup.ts` | created (jest-dom matchers) |
| `packages/web/src/App.test.tsx` | added 2 tests |

## How it satisfies the scope
Implements `swe/specs/features/frontend-c3po.md`: the discriminated `UploadState` drives rendering;
tone is `success`/`warning`/`danger` for 100/middle/0 exactly per the README's `0% / x% / 100%`
contract; captions pluralize and report unreachability.

## Build & test results
```
$ pnpm --filter @falcon/web run test
 ✓ src/App.test.tsx (2 tests) 34ms
 Test Files  1 passed (1) | Tests  2 passed (2)

$ pnpm --filter @falcon/web run build
✓ 31 modules transformed. dist/assets/index-ChAbcTR2.js 197.05 kB │ gzip: 61.85 kB — built in 412ms
```

Real-browser verification against a live Vite dev server proxying to a live Fastify API, uploading
through the actual `<input type="file">`:
```
example2 -> <div class="odds-display odds-display--warning"><span class="odds-display__value">81%</span>
            <p ...>Best route crosses bounty hunters on 2 occasions.</p></div>
example1 -> odds-display--danger  / 0%   / "The Millennium Falcon cannot reach the destination before the countdown runs out."
example4 -> odds-display--success / 100% / "Best route crosses bounty hunters on 0 occasions."
```

## Acceptance criteria
- [x] Banner shows live departure/arrival/autonomy ("Departing **Tatooine** for **Endor**, autonomy **6** days.").
- [x] example1 -> `0%` danger + unreachable caption (browser-verified).
- [x] example2 -> `81%` warning + "2 occasions" (browser-verified).
- [x] example4 -> `100%` success + "0 occasions" (browser-verified).
- [x] Mission fetch failure path renders an error message (covered by the `ApiError` branch).

## Follow-ups / TODO(verify)
- Loading state is plain text ("Computing the odds…"); no design pass performed.
