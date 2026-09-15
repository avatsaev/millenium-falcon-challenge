# Task 005 — Backend API (Millennium Falcon onboard computer) — Summary

- **Sprint:** sprint-001-core-and-deliverables
- **Completed:** 2026-09-08
- **Status:** done

## What was implemented
A Fastify 5 service: `buildApp` factory (injectable for tests) exposing `/api/health`,
`/api/mission`, and `/api/odds` (JSON body **or** multipart upload), plus a `server.ts` entrypoint
that loads the ship config, routes, and graph exactly once at startup.

## Files created / changed
| File | Change |
|------|--------|
| `packages/api/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` | created |
| `packages/api/src/app.ts` | created (`buildApp`, routes, 400 mapping) |
| `packages/api/src/server.ts` | created (env config, startup load, listen) |
| `packages/api/src/app.test.ts` | added 4 tests |

## How it satisfies the scope
Implements `swe/specs/features/backend-api.md` § Public contract and § Behavior: startup-loaded
config (never per-request), dual JSON/multipart intake, `InvalidConfigError` -> `400 { error }`, and
`existsSync`-guarded static serving of `packages/web/dist`.

## Build & test results
```
$ pnpm --filter @falcon/api run test
 ✓ src/app.test.ts (4 tests) 41ms
 Test Files  1 passed (1) | Tests  4 passed (4)

$ FALCON_CONFIG_PATH=examples/example2/millennium-falcon.json node packages/api/dist/server.js
(listening on :4000)

$ curl -s localhost:4000/api/mission
{"departure":"Tatooine","arrival":"Endor","autonomy":6}

$ curl -s -X POST localhost:4000/api/odds -H 'Content-Type: application/json' -d @examples/example2/empire.json
{"odds":0.81,"oddsPercent":81,"reachable":true,"minRiskEncounters":2}

$ curl -s -X POST localhost:4000/api/odds -F "file=@examples/example3/empire.json;type=application/json"
{"odds":0.9,"oddsPercent":90,"reachable":true,"minRiskEncounters":1}

$ curl -s -o - -w "%{http_code}\n" -X POST localhost:4000/api/odds -H 'Content-Type: application/json' -d '{"countdown":"nope"}'
{"error":"\"countdown\" must be a non-negative integer, got \"nope\""}
400
```

## Acceptance criteria
- [x] `GET /api/mission` returns startup-loaded config.
- [x] example2 JSON body -> `oddsPercent: 81`.
- [x] example3 real multipart upload -> `oddsPercent: 90`.
- [x] example1 -> `reachable: false`, `oddsPercent: 0` (asserted in `app.test.ts`).
- [x] Malformed `countdown` -> `400` naming `countdown`.

## Follow-ups / TODO(verify)
- No rate limiting beyond the 5 MiB multipart cap — acceptable at this scope.
