/**
 * Deterministic planet layout — see `swe/specs/architecture/graph-layout.md`.
 *
 * The routes database carries no coordinates, so screen positions are *derived* from the graph by
 * a small Fruchterman–Reingold-style force simulation: all-pairs repulsion keeps labels apart,
 * springs on real routes pull connected planets to a travel-time-proportional distance, and a weak
 * centring force stops isolated planets drifting off-canvas. Determinism is load-bearing — no
 * `Math.random`, `Date.now`, `performance.now`, or DOM measurement; only the seeded `mulberry32`
 * PRNG below, over lexicographically pre-sorted input.
 */

export interface PlanetPosition {
  readonly x: number;
  readonly y: number;
}

export type PlanetPositions = ReadonlyMap<string, PlanetPosition>;

export interface LayoutRoute {
  readonly origin: string;
  readonly destination: string;
  readonly travelTime: number;
}

export interface LayoutOptions {
  /** SVG viewBox width. Default 1000. */
  readonly width?: number;
  /** SVG viewBox height. Default 620. */
  readonly height?: number;
  /** Keeps labels/badges inside the box. Default 72. */
  readonly padding?: number;
  /** Seeds the deterministic PRNG. Default 0x5eed. */
  readonly seed?: number;
  /** Fixed relaxation step count — no convergence check. Default 400. */
  readonly iterations?: number;
}

// Tunables, chosen for the challenge's 4-planet fixture universe (see graph-layout.md §Behavior).
/** Rest length of the shortest (1-day) spring, in layout units. */
const MIN_EDGE = 90;
/** Extra rest length added per extra day of travel time beyond the shortest route. */
const EDGE_SCALE = 18;
/** Coulomb-style all-pairs repulsion strength. */
const REPULSION = 9000;
/** Hooke's-law spring stiffness pulling connected planets toward `restLength`. */
const SPRING = 0.06;
/** Weak pull toward the canvas centre, keeps isolated planets on-canvas. */
const CENTERING = 0.02;
/** Per-iteration displacement cap, prevents an early high-force step from ejecting a planet. */
const MAX_STEP = 14;
/** Distance floor for repulsion/spring direction math, avoids division by zero. */
const EPS = 1e-6;

interface Vec {
  x: number;
  y: number;
}

/** Deterministic 32-bit PRNG (public-domain mulberry32), the simulation's only source of noise. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Every planet the layout must place: the input list plus any endpoint only named by a route. */
function collectNames(planets: readonly string[], edges: readonly LayoutRoute[]): string[] {
  const names = new Set(planets);
  for (const edge of edges) {
    names.add(edge.origin);
    names.add(edge.destination);
  }
  return [...names].sort();
}

function seedPositions(names: readonly string[], center: Vec, radius: number, rng: () => number): Map<string, Vec> {
  const pos = new Map<string, Vec>();
  const jitterMag = radius / 20;
  names.forEach((name, i) => {
    const angle = (2 * Math.PI * i) / names.length;
    pos.set(name, {
      x: center.x + radius * Math.cos(angle) + (rng() * 2 - 1) * jitterMag,
      y: center.y + radius * Math.sin(angle) + (rng() * 2 - 1) * jitterMag,
    });
  });
  return pos;
}

function restLengthOf(edge: LayoutRoute, minTravel: number): number {
  return MIN_EDGE + (edge.travelTime - minTravel) * EDGE_SCALE;
}

function relax(names: readonly string[], edges: readonly LayoutRoute[], pos: Map<string, Vec>, center: Vec, iterations: number, rng: () => number): void {
  const minTravel = edges.length > 0 ? Math.min(...edges.map((edge) => edge.travelTime)) : 1;

  for (let step = 1; step <= iterations; step++) {
    const temperature = 1 - step / iterations;
    const force = new Map<string, Vec>(names.map((name) => [name, { x: 0, y: 0 }]));

    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i]!;
        const b = names[j]!;
        const pa = pos.get(a)!;
        const pb = pos.get(b)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        if (dx === 0 && dy === 0) {
          dx = (rng() * 2 - 1) * EPS * 10;
          dy = (rng() * 2 - 1) * EPS * 10;
        }
        const len = Math.max(Math.hypot(dx, dy), EPS);
        const mag = REPULSION / (len * len);
        const fx = (dx / len) * mag;
        const fy = (dy / len) * mag;
        const fa = force.get(a)!;
        const fb = force.get(b)!;
        fa.x += fx;
        fa.y += fy;
        fb.x -= fx;
        fb.y -= fy;
      }
    }

    for (const edge of edges) {
      const pa = pos.get(edge.origin)!;
      const pb = pos.get(edge.destination)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const len = Math.max(Math.hypot(dx, dy), EPS);
      const pull = SPRING * (len - restLengthOf(edge, minTravel));
      const fx = (dx / len) * pull;
      const fy = (dy / len) * pull;
      const fa = force.get(edge.origin)!;
      const fb = force.get(edge.destination)!;
      fa.x += fx;
      fa.y += fy;
      fb.x -= fx;
      fb.y -= fy;
    }

    for (const name of names) {
      const p = pos.get(name)!;
      const f = force.get(name)!;
      f.x += (center.x - p.x) * CENTERING;
      f.y += (center.y - p.y) * CENTERING;
    }

    for (const name of names) {
      const f = force.get(name)!;
      let sx = f.x * temperature;
      let sy = f.y * temperature;
      const stepMag = Math.hypot(sx, sy);
      if (stepMag > MAX_STEP) {
        const scale = MAX_STEP / stepMag;
        sx *= scale;
        sy *= scale;
      }
      const p = pos.get(name)!;
      p.x += sx;
      p.y += sy;
    }
  }
}

/** Uniform scale + translate into the padded box, aspect ratio preserved. */
function fitToBox(names: readonly string[], pos: Map<string, Vec>, width: number, height: number, padding: number): Map<string, PlanetPosition> {
  const xs = names.map((name) => pos.get(name)!.x);
  const ys = names.map((name) => pos.get(name)!.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const targetWidth = width - 2 * padding;
  const targetHeight = height - 2 * padding;
  const scale = spanX === 0 && spanY === 0 ? 1 : Math.min(spanX > 0 ? targetWidth / spanX : Infinity, spanY > 0 ? targetHeight / spanY : Infinity);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const boxCenterX = width / 2;
  const boxCenterY = height / 2;

  const result = new Map<string, PlanetPosition>();
  for (const name of names) {
    const p = pos.get(name)!;
    const x = Math.min(Math.max(boxCenterX + (p.x - centerX) * scale, padding), width - padding);
    const y = Math.min(Math.max(boxCenterY + (p.y - centerY) * scale, padding), height - padding);
    result.set(name, { x: round2(x), y: round2(y) });
  }
  return result;
}

export function layoutUniverse(planets: readonly string[], routes: readonly LayoutRoute[], options: LayoutOptions = {}): PlanetPositions {
  const width = options.width ?? 1000;
  const height = options.height ?? 620;
  const padding = options.padding ?? 72;
  const seed = options.seed ?? 0x5eed;
  const iterations = options.iterations ?? 400;

  const edges = [...routes].sort((a, b) => (a.origin === b.origin ? (a.destination < b.destination ? -1 : a.destination > b.destination ? 1 : 0) : a.origin < b.origin ? -1 : 1));
  const names = collectNames(planets, edges);
  if (names.length === 0) return new Map();

  const rng = mulberry32(seed);
  const center: Vec = { x: width / 2, y: height / 2 };
  const radius = Math.min(width, height) / 3;

  const pos = seedPositions(names, center, radius, rng);
  relax(names, edges, pos, center, iterations, rng);
  return fitToBox(names, pos, width, height, padding);
}
