# Submission notes — Millennium Falcon challenge

Reviewer-facing run instructions. `README.md` at the repo root is the original challenge brief and is
left untouched; this file documents how to install, build, run and test the implementation in this
repo.

## Run it in Docker (no toolchain needed)

Two containers: the onboard computer (Fastify), and C3PO served by nginx which proxies `/api` to it.

```sh
docker compose up --build
# then open http://localhost:8080
```

The universe is mounted, not baked in — point `UNIVERSE` at any directory holding a
`millennium-falcon.json` plus the routes database it names:

```sh
UNIVERSE=./examples/example4 docker compose up --build
```

`web` waits for the API's `GET /api/health` probe before starting. The API is also published on
`localhost:4000` so it can be curled directly:

```sh
curl -s localhost:8080/api/universe
curl -s -F file=@examples/example2/empire.json localhost:8080/api/odds
```

Everything below is the same stack without Docker.

## Install

```sh
pnpm install
```

Node **24** (`.nvmrc`) and pnpm 11 (pinned by `packageManager`; `corepack enable` installs it). pnpm 11
imports `node:sqlite`, so it does not run on Node 20 or 22.

## Build

```sh
pnpm run build
```

Builds `packages/core` first (workspace dependency order), then `packages/api`, `packages/cli`,
`packages/web`.

## Run the whole app (one URL, no dev server)

After `pnpm run build`, the API serves the built frontend, so the full app is one process:

```sh
FALCON_CONFIG_PATH=examples/example2/millennium-falcon.json node packages/api/dist/server.js
# then open http://localhost:4000
```

`FALCON_CONFIG_PATH` may be absolute or relative to the CWD; it is the `millennium-falcon.json` the
onboard computer boots with, exactly as the README describes (any of `examples/example{1..4}/` works —
they share the same config; the countdown and hunter intel come from the uploaded `empire.json`).
Without it the server looks for `./millennium-falcon.json` and exits `1` with a descriptive error.

## Install the CLI (`give-me-the-odds`)

```sh
pnpm run link:cli
```

This links `packages/cli`'s built bin (`dist/cli.js`, already carrying a `#!/usr/bin/env node`
shebang and a `bin: { "give-me-the-odds": "./dist/cli.js" }` entry) onto the global `pnpm` bin
directory via `pnpm add -g .`, so `give-me-the-odds` resolves on `PATH`. Requires the global pnpm bin
directory to be on `PATH` (`pnpm setup` configures this once per machine).

Then the exact invocation pinned by README:116-119:

```sh
$ give-me-the-odds examples/example2/millennium-falcon.json examples/example2/empire.json
81
```

Verified, verbatim, against all four fixtures:

```sh
$ give-me-the-odds examples/example1/millennium-falcon.json examples/example1/empire.json
0
$ give-me-the-odds examples/example2/millennium-falcon.json examples/example2/empire.json
81
$ give-me-the-odds examples/example3/millennium-falcon.json examples/example3/empire.json
90
$ give-me-the-odds examples/example4/millennium-falcon.json examples/example4/empire.json
100
```

### Fallback (no global link)

If linking a bin globally isn't available or wanted, run the built entrypoint directly with `node`:

```sh
node packages/cli/dist/cli.js examples/example2/millennium-falcon.json examples/example2/empire.json
```

## Run the API

```sh
FALCON_CONFIG_PATH=examples/example2/millennium-falcon.json node packages/api/dist/server.js
```

Serves `GET /api/universe` and `POST /api/odds` on `PORT` (default `4000`).

## Run the frontend dev server

```sh
pnpm run dev:web
```

Vite dev server on port 5173, proxying `/api` to the running API.

## Test / typecheck

```sh
pnpm run test
pnpm run typecheck
```

53 tests: `packages/core` 17 (the DP against all four `examples/*/answer.json`, edge cases and the exact
itineraries), `packages/web` 24, `packages/api` 8, `packages/cli` 4.

`.github/workflows/ci.yml` runs the same thing on every push — `pnpm install --frozen-lockfile`, then
`build`, `lint`, `test` on Node 24. Note that `lint` aliases `tsc --noEmit`: there is no ESLint or Biome
config in this repo, so it is a typecheck, not a style gate.

## What's implemented

| Piece | Where | Notes |
|-------|-------|-------|
| Shared domain + odds algorithm | `packages/core` | validating loaders (`millennium-falcon.json`, `empire.json`, SQLite `ROUTES`), graph builder, the DP |
| Onboard computer (HTTP) | `packages/api` | Fastify; `GET /api/universe`, `POST /api/odds` (JSON body or multipart upload), serves the built SPA |
| C3PO (frontend) | `packages/web` | React + Vite SPA: upload `empire.json`, odds as a percentage, plus a star map explaining the route |
| R2D2 (CLI) | `packages/cli` | `give-me-the-odds <falcon.json> <empire.json>` prints the percentage as a plain number |

The odds are a dynamic program over `(day, planet, fuel)` minimising bounty-hunter encounters and
returning the day-by-day itinerary it chose; the capture probability is the README's geometric series,
i.e. `1 - 0.9^k` for `k` encounters. Waiting is modelled as a refuel (refuelling is free once the day
is spent), so `O(countdown × planets × (autonomy + 1))` states cover travel, refuel and wait alike —
308 states for the example universe.

53 tests: `packages/core` 17 (algorithm + loaders, asserted against `examples/*/answer.json`),
`packages/api` 8 (both payload shapes, error paths), `packages/web` 24 (odds display, map, layout and
itinerary derivations), `packages/cli` 4 (all four fixtures + error paths). The frontend and the
`give-me-the-odds` invocation were additionally verified in a real browser and a real shell against a
live server, not only under mocks.

## AI tools used

The README's final note asks which AI tooling was used and why. Full disclosure:

| Tool | Role |
|------|------|
| [**Pi**](https://pi.dev/) | The coding agent / harness everything ran in |
| [**av-swe**](https://github.com/avatsaev/av-swe-skill) | My own agent skill, used for the project management layer |
| **Claude Opus 5** | Planning — scoping the challenge into specs, deriving the sprint/task plan |
| **Claude Sonnet 5** | Implementation — executing the tasks, writing the code and tests |

### av-swe

`av-swe` is an agent skill I wrote myself ([source](https://github.com/avatsaev/av-swe-skill), MIT). It
turns a body of work into a versioned, ordered, dependency-aware plan on disk and then executes it one
sprint at a time through a `backlog -> in_progress -> blocked -> done` state machine. Three ops matter
here: `scope` captures the requirements into spec docs, `plan` derives the sprints and atomic tasks from
those specs plus the real source, and `implement` runs a sprint task by task — **gated on the project's
actual build/typecheck/test commands**, so a task cannot be marked done while anything is red, and each
finished task leaves a summary recording what changed, which spec section it satisfies, and the real
command output that proved it.

The output of that is committed under `swe/`, so the whole development history is auditable rather than
asserted: `PLAN.md` (strategy, task index, coverage), `specs/` (four feature specs, three architecture
specs), and `sprints/` — two sprints, twelve tasks, each with its audit trail in `done/`.

### Why this setup

The challenge is small in code but specification-heavy: four worked examples that pin the algorithm's
every tie-break, three deliverables sharing one domain layer, and an explicit display contract. That is
exactly the shape where an unplanned agent session drifts — it will happily produce four plausible odds
implementations that disagree on example 4.

Writing the specs first and executing them under `av-swe`'s gates kept each decision anchored to a
README line and verifiable on its own: the DP's wait/refuel semantics, the HTTP contract, the
percentage's display rules. Splitting the models follows where each is worth its cost — Opus for the
design work where a wrong call is expensive to unwind, Sonnet for executing tasks that were already
specified down to their acceptance criteria.

Nothing was accepted on the agent's word. Every acceptance criterion was checked against running code:
the four fixtures through the linked `give-me-the-odds` binary, the API through real multipart uploads,
and the frontend in a real browser against a live server — not only under mocked `fetch`.
