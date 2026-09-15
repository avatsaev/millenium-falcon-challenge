# Architecture — Deterministic planet layout

> Part of: [../overview.md](../overview.md)
> Dependencies: none (pure geometry, no React, no DOM)

## Purpose

The routes database has **no coordinates** — its only columns are `origin`, `destination`,
`travel_time`. To draw a star map, positions must be *derived* from the graph, and derived
**deterministically**: the same universe must produce byte-identical geometry on every render, in
every process, so unit tests and browser screenshots are stable and React re-renders never make the
map jitter.

Lives in `packages/web/src/map/layout.ts`. Pure function, no dependencies.

## Public contract

| Signature | Inputs | Outputs | Errors |
|-----------|--------|---------|--------|
| `layoutUniverse(planets, routes, options?): PlanetPositions` | planet names, undirected routes with `travelTime`, optional geometry overrides | `ReadonlyMap<string, { x: number; y: number }>` covering **every** input planet | none — degenerate inputs (0/1 planet, no routes) return valid geometry |

```ts
interface LayoutOptions {
  width?: number;      // default 1000  — matches the SVG viewBox
  height?: number;     // default 620   — matches the SVG viewBox
  padding?: number;    // default 72    — keeps labels/badges inside the box
  seed?: number;       // default 0x5eed
  iterations?: number; // default 400   — fixed, no convergence check
}
```

### Determinism contract (load-bearing)

- No `Math.random`, no `Date.now`, no `performance.now`, no DOM measurement.
- Fixed iteration count — the loop never terminates early on a convergence test, so runtime is bounded
  and output does not depend on floating-point luck.
- **Input-order independent**: planets are sorted lexicographically and routes are sorted by
  `(origin, destination)` before anything else runs, so the API's `graph.planets` order (which is
  insertion order — `[Tatooine, Endor, Dagobah, Hoth]` for the fixtures, because departure/arrival are
  forced in first) cannot leak into the geometry.
- Coordinates are rounded to 2 decimals on the way out, so snapshots do not churn on
  platform-dependent floating-point noise.

### Geometric contract (the map means something)

Spring rest length is proportional to travel time, so **a 6-day jump is drawn roughly six times longer
than a 1-day jump**. The map is not just a diagram of connectivity; distance on screen reads as days
of travel.

## Behavior & algorithms

A small Fruchterman–Reingold-style force simulation: all-pairs repulsion keeps labels apart, springs on
real routes pull connected planets to a travel-time-proportional distance, a weak centring force stops
disconnected components (an isolated departure/arrival planet) drifting off-canvas.

```
layoutUniverse(planets, routes, options):
    names  = sort(unique(planets))                    # order-independent
    edges  = sort(routes, by origin then destination)
    rng    = mulberry32(seed)                          # 32-bit deterministic PRNG

    # --- seeding: even circle + small seeded jitter to break perfect symmetry
    for i, name in names:
        angle = 2*pi*i / count(names)
        pos[name] = center + polar(radius = min(w,h)/3, angle) + jitter(rng, +-radius/20)

    # --- rest length: shortest route is MIN_EDGE, every extra travel day adds EDGE_SCALE
    minTravel = min(travelTime over edges)  (1 when there are no edges)
    restLength(e) = MIN_EDGE + (e.travelTime - minTravel) * EDGE_SCALE

    # --- relaxation
    for step in 1..iterations:
        temperature = 1 - step/iterations            # linear cooling
        force = zero vector per planet

        for each unordered pair (a, b):              # Coulomb repulsion
            d = pos[a] - pos[b]  (nudged by rng if exactly coincident)
            force[a] += normalize(d) * REPULSION / max(len(d), EPS)^2
            force[b] -= same

        for each edge (a, b):                        # Hooke spring
            d = pos[b] - pos[a]
            pull = SPRING * (len(d) - restLength(edge))
            force[a] += normalize(d) * pull
            force[b] -= normalize(d) * pull

        for each planet p:                           # weak centring
            force[p] += (center - pos[p]) * CENTERING

        for each planet p:                           # integrate, clamped
            pos[p] += clampMagnitude(force[p] * temperature, MAX_STEP)

    # --- fit: uniform scale + translate into the padded box, aspect ratio preserved
    return round2(fitToBox(pos, width, height, padding))
```

Tunables live as module constants (`MIN_EDGE`, `EDGE_SCALE`, `REPULSION`, `SPRING`, `CENTERING`,
`MAX_STEP`, `EPS`) with values chosen for the fixture universe and documented as such.

Cost is `O(iterations * planets^2)` — 400 × 4² ≈ 6 400 vector ops for the fixture universe, computed
once per universe (memoised on the query result), never per frame.

## Data & persistence touchpoints

None. Input comes from `GET /api/universe`; output is held in a `useMemo` keyed on the universe.

## Error handling & edge cases

| Condition | Expected behavior |
|-----------|-------------------|
| Zero planets | empty map returned; caller renders an empty map, no crash |
| One planet | placed at the centre of the box |
| No routes at all | repulsion + centring only — planets spread evenly around the centre |
| Two planets at identical coordinates (jitter collided) | separation is nudged by the seeded PRNG, still deterministic; no division by zero (`EPS` floor) |
| Route referencing a planet absent from `planets` | that planet is added to the layout (it is a real node of the graph); never throws |
| Duplicate routes between the same pair | both springs apply — harmless, slightly stiffer edge |
| Isolated departure/arrival (server forces them into `graph.planets`, so they arrive in `planets`) | centring keeps them inside the padded box |
| Very long travel times | rest length grows linearly; the final fit-to-box rescales everything, so the map never overflows |

## Dependencies on other specs

- None inbound. [../features/universe-map.md](../features/universe-map.md) is its only consumer.

## Acceptance criteria

- [x] Called twice with identical input, returns identical coordinates for every planet.
- [x] Shuffling the `planets` array and the `routes` array produces identical coordinates — geometry
      is independent of input order.
- [x] For the fixture universe, the drawn length of `Tatooine–Dagobah` (6 days) is strictly greater
      than `Dagobah–Hoth` (1 day) — travel time is legible as distance.
- [x] Every returned coordinate lies inside the padded box (`padding <= x <= width - padding`, same
      for `y`).
- [x] For the fixture universe, no two planets are closer than a documented minimum separation, so
      labels do not collide (best-effort in general; asserted for the fixtures).
- [x] A universe with one planet and no routes returns that planet at the box centre.
- [x] A route naming a planet missing from `planets` still yields a position for it.

## TODO(verify)

- [ ] Minimum planet separation is **best-effort**, not guaranteed: a force layout plus a hard
      fit-to-box cannot promise non-overlap for an arbitrary graph. Acceptable given the challenge's
      4-planet universe; if arbitrary universes must be supported, the fallback is a post-pass that
      pushes overlapping pairs apart (deterministically) before fitting.
