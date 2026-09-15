# Feature — CLI (R2D2 / give-me-the-odds)

> Part of: [../overview.md](../overview.md)
> Dependencies: [../architecture/odds-algorithm.md](../architecture/odds-algorithm.md)

## Purpose

Standalone command-line executable that computes and prints the Falcon's odds of success as a
plain 0–100 integer, independent of the backend/frontend — calls `@falcon/core` directly.

## Public contract

| Invocation | Inputs | Output (stdout) | Errors (stderr, exit code) |
|------------|--------|-----------------|------------------------------|
| `give-me-the-odds <millennium-falcon.json> <empire.json>` | two file paths (argv) | a single integer 0–100, newline-terminated | usage message + exit 1 if either arg missing; error message + exit 1 on any `InvalidConfigError`/IO failure |

Exported for reuse/testing: `computeOddsPercent(falconConfigPath: string, empireConfigPath: string): Promise<number>` (`packages/cli/src/run.ts`).

## Behavior & algorithms

```
main(argv):
  [falconConfigPath, empireConfigPath] = argv[2..]
  if either missing:
    print usage to stderr; exit 1

  try:
    percent = computeOddsPercent(falconConfigPath, empireConfigPath)
    print(percent)   # stdout, plain integer
  catch error:
    print(error.message) to stderr
    exit 1

computeOddsPercent(falconPath, empirePath):
  falconConfig = loadFalconConfig(falconPath)
  empireConfig = loadEmpireConfig(empirePath)
  routes = loadRoutes(falconConfig.routesDb)
  graph = buildGraph(routes, [falconConfig.departure, falconConfig.arrival])
  result = computeOdds({ graph, autonomy: falconConfig.autonomy, departure, arrival,
                          countdown: empireConfig.countdown, bountyHunters: empireConfig.bountyHunters })
  return round(result.odds * 100)
```

Rounding: nearest integer (`Math.round`) — the README does not specify precision beyond "a number
ranging from 0 to 100"; matches the documented example (`81`) exactly.

## Data & persistence touchpoints

Reads both config files and the SQLite routes DB fresh on every invocation (no long-lived process,
unlike the API).

## Error handling & edge cases

| Condition | Expected behavior |
|-----------|-------------------|
| Missing argv (0 or 1 args) | usage message on stderr, exit code 1 |
| `millennium-falcon.json`/`empire.json` path does not exist or is unreadable | error message on stderr (e.g. `could not read empire.json at "...": ENOENT...`), exit code 1 |
| Either file has invalid JSON or fails schema validation | error message on stderr, exit code 1 |
| Mission unreachable within countdown | prints `0`, exit code 0 (this is a valid successful computation, not an error) |

## Dependencies on other specs

- [../architecture/odds-algorithm.md](../architecture/odds-algorithm.md) — `computeOdds`, config
  loaders, `loadRoutes`.

## Acceptance criteria

- [x] `give-me-the-odds examples/example1/millennium-falcon.json examples/example1/empire.json`
      prints `0`.
- [x] `.../example2/...` prints `81`.
- [x] `.../example3/...` prints `90`.
- [x] `.../example4/...` prints `100`.
- [x] Invoked with no args: prints usage to stderr, exits 1.
- [x] Invoked with a nonexistent empire.json path: prints a descriptive error to stderr, exits 1.

(Already implemented and verified — `packages/cli/src/run.test.ts` (4 tests) plus a manual run of the
built `packages/cli/dist/cli.js` against all four example fixtures and both error paths during initial
build.)

## TODO(verify)

- [ ] No `bin` symlink is installed globally yet (README shows `$ give-me-the-odds ...` as if
      installed on `PATH`). Currently run via `node packages/cli/dist/cli.js ...`. Decide whether a task
      should wire `pnpm link --global` or document the equivalent for submission.
