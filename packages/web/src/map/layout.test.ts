import { describe, expect, it } from "vitest";
import { layoutUniverse, type LayoutRoute, type PlanetPositions } from "./layout";

const FIXTURE_PLANETS = ["Tatooine", "Endor", "Dagobah", "Hoth"];
const FIXTURE_ROUTES: readonly LayoutRoute[] = [
  { origin: "Dagobah", destination: "Endor", travelTime: 4 },
  { origin: "Dagobah", destination: "Hoth", travelTime: 1 },
  { origin: "Dagobah", destination: "Tatooine", travelTime: 6 },
  { origin: "Endor", destination: "Hoth", travelTime: 1 },
  { origin: "Hoth", destination: "Tatooine", travelTime: 6 },
];

const WIDTH = 1000;
const HEIGHT = 620;
const PADDING = 72;
function distance(positions: PlanetPositions, a: string, b: string): number {
  const pa = positions.get(a)!;
  const pb = positions.get(b)!;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}

describe("layoutUniverse", () => {
  it("is deterministic: identical input produces identical coordinates", () => {
    const first = layoutUniverse(FIXTURE_PLANETS, FIXTURE_ROUTES);
    const second = layoutUniverse(FIXTURE_PLANETS, FIXTURE_ROUTES);
    expect([...second]).toEqual([...first]);
  });

  it("is input-order independent: shuffling planets and routes changes nothing", () => {
    const baseline = layoutUniverse(FIXTURE_PLANETS, FIXTURE_ROUTES);
    const shuffled = layoutUniverse([...FIXTURE_PLANETS].reverse(), [...FIXTURE_ROUTES].reverse());
    for (const planet of FIXTURE_PLANETS) {
      expect(shuffled.get(planet)).toEqual(baseline.get(planet));
    }
  });

  it("draws a longer route as strictly longer on screen: 6-day beats 1-day", () => {
    const positions = layoutUniverse(FIXTURE_PLANETS, FIXTURE_ROUTES);
    expect(distance(positions, "Tatooine", "Dagobah")).toBeGreaterThan(distance(positions, "Dagobah", "Hoth"));
  });

  it("keeps every coordinate inside the padded box", () => {
    const positions = layoutUniverse(FIXTURE_PLANETS, FIXTURE_ROUTES);
    for (const { x, y } of positions.values()) {
      expect(x).toBeGreaterThanOrEqual(PADDING);
      expect(x).toBeLessThanOrEqual(WIDTH - PADDING);
      expect(y).toBeGreaterThanOrEqual(PADDING);
      expect(y).toBeLessThanOrEqual(HEIGHT - PADDING);
    }
  });

  it("keeps no two fixture planets closer than a documented minimum separation", () => {
    const positions = layoutUniverse(FIXTURE_PLANETS, FIXTURE_ROUTES);
    const names = [...positions.keys()];
    // Tuned for the fixture universe: repulsion + travel-time-proportional springs keep every pair
    // well clear of label-collision distance at the default 1000x620 canvas size.
    const MIN_SEPARATION = 100;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        expect(distance(positions, names[i]!, names[j]!)).toBeGreaterThan(MIN_SEPARATION);
      }
    }
  });

  it("places a single planet with no routes at the box centre", () => {
    const positions = layoutUniverse(["Tatooine"], []);
    expect(positions.size).toBe(1);
    expect(positions.get("Tatooine")).toEqual({ x: WIDTH / 2, y: HEIGHT / 2 });
  });

  it("returns an empty map for zero planets without throwing", () => {
    expect(() => layoutUniverse([], [])).not.toThrow();
    expect(layoutUniverse([], []).size).toBe(0);
  });

  it("places a planet named only by a route, absent from the planets list", () => {
    const positions = layoutUniverse(["A"], [{ origin: "A", destination: "B", travelTime: 3 }]);
    expect(positions.has("A")).toBe(true);
    expect(positions.has("B")).toBe(true);
  });
});
