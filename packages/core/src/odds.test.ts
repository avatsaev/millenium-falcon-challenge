import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isRecord } from "./guards.js";
import { buildGraph } from "./graph.js";
import { computeOdds } from "./odds.js";
import { dedupeSightings } from "./odds.js";
import { loadEmpireConfig, loadFalconConfig } from "./config.js";
import { loadRoutes } from "./routes-db.js";
import { InvalidConfigError } from "./errors.js";
import type { OddsResult, Route } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "..", "..", "examples");

interface Fixture {
  readonly result: OddsResult;
  readonly autonomy: number;
  readonly departure: string;
  readonly arrival: string;
  readonly countdown: number;
  readonly routes: readonly Route[];
}

async function loadFixture(name: string, routesOverride?: readonly Route[]): Promise<Fixture> {
  const dir = join(examplesDir, name);
  const falconConfig = await loadFalconConfig(join(dir, "millennium-falcon.json"));
  const empireConfig = await loadEmpireConfig(join(dir, "empire.json"));
  const routes = routesOverride ?? loadRoutes(falconConfig.routesDb);
  const graph = buildGraph(routes, [falconConfig.departure, falconConfig.arrival]);
  const result = computeOdds({
    graph,
    autonomy: falconConfig.autonomy,
    departure: falconConfig.departure,
    arrival: falconConfig.arrival,
    countdown: empireConfig.countdown,
    bountyHunters: empireConfig.bountyHunters,
  });
  return { result, autonomy: falconConfig.autonomy, departure: falconConfig.departure, arrival: falconConfig.arrival, countdown: empireConfig.countdown, routes };
}

async function expectedOdds(name: string): Promise<number> {
  const raw = await readFile(join(examplesDir, name, "answer.json"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || typeof parsed["odds"] !== "number") {
    throw new Error(`answer.json for ${name} must be an object with a numeric "odds" field`);
  }
  return parsed["odds"];
}

function travelTimeBetween(routes: readonly Route[], a: string, b: string): number | undefined {
  return routes.find((r) => (r.origin === a && r.destination === b) || (r.origin === b && r.destination === a))?.travelTime;
}

/**
 * Shared structural-invariant check for any reachable fixture's itinerary, per
 * `odds-algorithm.md` §Itinerary reconstruction. Independent of the specific plan: day
 * monotonicity, fuel arithmetic against the real route table, wait/refuel labelling, and the
 * encounter count matching `minRiskEncounters`.
 */
function assertItineraryInvariants(fixture: Fixture): void {
  const { result, autonomy, departure, arrival, countdown, routes } = fixture;
  const itinerary = result.itinerary;
  if (!itinerary) throw new Error("expected a reachable fixture with a non-null itinerary");

  const first = itinerary[0]!;
  expect(first.day).toBe(0);
  expect(first.planet).toBe(departure);
  expect(first.action).toBe("start");
  expect(first.from).toBeNull();
  expect(first.fuelAfter).toBe(autonomy);

  let huntersCount = 0;
  if (first.huntersPresent) huntersCount++;

  for (let i = 1; i < itinerary.length; i++) {
    const step = itinerary[i]!;
    const prevStep = itinerary[i - 1]!;
    if (step.huntersPresent) huntersCount++;

    expect(step.day).toBeGreaterThan(prevStep.day);

    if (step.action === "jump") {
      expect(step.from).toBe(prevStep.planet);
      const travelTime = step.day - prevStep.day;
      expect(travelTimeBetween(routes, prevStep.planet, step.planet)).toBe(travelTime);
      expect(step.fuelAfter).toBe(prevStep.fuelAfter - travelTime);
    } else {
      expect(["wait", "refuel"]).toContain(step.action);
      expect(step.from).toBeNull();
      expect(step.planet).toBe(prevStep.planet);
      expect(step.day).toBe(prevStep.day + 1);
      expect(step.fuelAfter).toBe(autonomy);
      expect(step.action).toBe(prevStep.fuelAfter < autonomy ? "refuel" : "wait");
    }
  }

  const last = itinerary[itinerary.length - 1]!;
  expect(last.planet).toBe(arrival);
  expect(last.day).toBe(result.arrivalDay);
  expect(last.day).toBeLessThanOrEqual(countdown);
  expect(huntersCount).toBe(result.minRiskEncounters);
}

describe("computeOdds against the README examples", () => {
  for (const name of ["example1", "example2", "example3", "example4"]) {
    it(`matches ${name}/answer.json`, async () => {
      const [{ result }, expected] = await Promise.all([loadFixture(name), expectedOdds(name)]);
      expect(result.odds).toBeCloseTo(expected, 9);
    });
  }
});

describe("computeOdds edge cases", () => {
  it("returns 100% odds when departure equals arrival and no hunters are present that day", () => {
    const graph = buildGraph([], ["Tatooine"]);
    const result = computeOdds({
      graph,
      autonomy: 6,
      departure: "Tatooine",
      arrival: "Tatooine",
      countdown: 0,
      bountyHunters: [],
    });
    expect(result).toEqual({
      odds: 1,
      reachable: true,
      minRiskEncounters: 0,
      arrivalDay: 0,
      itinerary: [{ day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false }],
    });
  });

  it("applies the day-0 risk when departure equals arrival and hunters are there on day 0", () => {
    const graph = buildGraph([], ["Tatooine"]);
    const result = computeOdds({
      graph,
      autonomy: 6,
      departure: "Tatooine",
      arrival: "Tatooine",
      countdown: 0,
      bountyHunters: [{ planet: "Tatooine", day: 0 }],
    });
    expect(result.odds).toBeCloseTo(0.9, 9);
    expect(result.minRiskEncounters).toBe(1);
    expect(result.arrivalDay).toBe(0);
    expect(result.itinerary).toEqual([{ day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: true }]);
  });

  it("reports unreachable with 0 odds when the graph is disconnected", () => {
    const graph = buildGraph(
      [{ origin: "A", destination: "B", travelTime: 1 }],
      ["A", "B", "Z"],
    );
    const result = computeOdds({
      graph,
      autonomy: 6,
      departure: "A",
      arrival: "Z",
      countdown: 10,
      bountyHunters: [],
    });
    expect(result).toEqual({ odds: 0, reachable: false, minRiskEncounters: null, arrivalDay: null, itinerary: null });
  });

  it("dedupes duplicate bounty hunter sightings on the same planet/day into a single risk trial", () => {
    const graph = buildGraph([], ["Tatooine"]);
    const result = computeOdds({
      graph,
      autonomy: 6,
      departure: "Tatooine",
      arrival: "Tatooine",
      countdown: 0,
      bountyHunters: [
        { planet: "Tatooine", day: 0 },
        { planet: "Tatooine", day: 0 },
      ],
    });
    expect(result.minRiskEncounters).toBe(1);
  });

  it("rejects a countdown whose (day, planet, fuel) grid would exceed the state-count ceiling", () => {
    const graph = buildGraph([{ origin: "Tatooine", destination: "Dagobah", travelTime: 1 }]);
    expect(() =>
      computeOdds({
        graph,
        autonomy: 1000,
        departure: "Tatooine",
        arrival: "Dagobah",
        countdown: 10_000_000,
        bountyHunters: [],
      }),
    ).toThrow(InvalidConfigError);
  });

  it("rejects a non-safe-integer countdown instead of silently truncating or overflowing the state grid", () => {
    const graph = buildGraph([], ["Tatooine"]);
    expect(() =>
      computeOdds({
        graph,
        autonomy: 6,
        departure: "Tatooine",
        arrival: "Tatooine",
        countdown: 1e100,
        bountyHunters: [],
      }),
    ).toThrow(InvalidConfigError);
  });
});

describe("dedupeSightings", () => {
  it("collapses repeated planet/day pairs and sorts by (day asc, planet asc)", () => {
    const deduped = dedupeSightings([
      { planet: "Hoth", day: 7 },
      { planet: "Dagobah", day: 6 },
      { planet: "Hoth", day: 6 },
      { planet: "Hoth", day: 7 },
    ]);
    expect(deduped).toEqual([
      { planet: "Dagobah", day: 6 },
      { planet: "Hoth", day: 6 },
      { planet: "Hoth", day: 7 },
    ]);
  });
});

describe("computeOdds itinerary reconstruction", () => {
  it("reconstructs example2's plan exactly, matching README §Example 2", async () => {
    const fixture = await loadFixture("example2");
    expect(fixture.result.arrivalDay).toBe(8);
    expect(fixture.result.itinerary).toEqual([
      { day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false },
      { day: 6, planet: "Hoth", action: "jump", from: "Tatooine", fuelAfter: 0, huntersPresent: true },
      { day: 7, planet: "Hoth", action: "refuel", from: null, fuelAfter: 6, huntersPresent: true },
      { day: 8, planet: "Endor", action: "jump", from: "Hoth", fuelAfter: 5, huntersPresent: false },
    ]);
    assertItineraryInvariants(fixture);
  });

  it("reconstructs example3's plan exactly, matching README §Example 3", async () => {
    const fixture = await loadFixture("example3");
    expect(fixture.result.arrivalDay).toBe(9);
    expect(fixture.result.itinerary).toEqual([
      { day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false },
      { day: 6, planet: "Dagobah", action: "jump", from: "Tatooine", fuelAfter: 0, huntersPresent: false },
      { day: 7, planet: "Dagobah", action: "refuel", from: null, fuelAfter: 6, huntersPresent: false },
      { day: 8, planet: "Hoth", action: "jump", from: "Dagobah", fuelAfter: 5, huntersPresent: true },
      { day: 9, planet: "Endor", action: "jump", from: "Hoth", fuelAfter: 4, huntersPresent: false },
    ]);
    assertItineraryInvariants(fixture);
  });

  it("reconstructs example4's plan exactly, matching README §Example 4's second listed variant", async () => {
    const fixture = await loadFixture("example4");
    expect(fixture.result.arrivalDay).toBe(10);
    expect(fixture.result.minRiskEncounters).toBe(0);
    expect(fixture.result.itinerary).toEqual([
      { day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false },
      { day: 1, planet: "Tatooine", action: "wait", from: null, fuelAfter: 6, huntersPresent: false },
      { day: 7, planet: "Dagobah", action: "jump", from: "Tatooine", fuelAfter: 0, huntersPresent: false },
      { day: 8, planet: "Dagobah", action: "refuel", from: null, fuelAfter: 6, huntersPresent: false },
      { day: 9, planet: "Hoth", action: "jump", from: "Dagobah", fuelAfter: 5, huntersPresent: false },
      { day: 10, planet: "Endor", action: "jump", from: "Hoth", fuelAfter: 4, huntersPresent: false },
    ]);
    assertItineraryInvariants(fixture);
  });

  it("returns a null itinerary and arrivalDay for the unreachable example1", async () => {
    const fixture = await loadFixture("example1");
    expect(fixture.result.reachable).toBe(false);
    expect(fixture.result.arrivalDay).toBeNull();
    expect(fixture.result.itinerary).toBeNull();
  });

  it("is unaffected by the input routes array's order (adjacency is sorted at build time)", async () => {
    const straight = await loadFixture("example2");
    const shuffledRoutes = [...straight.routes].reverse();
    const shuffled = await loadFixture("example2", shuffledRoutes);
    expect(shuffled.result.itinerary).toEqual(straight.result.itinerary);
    expect(shuffled.result.arrivalDay).toBe(straight.result.arrivalDay);
  });

  it("returns the single start step, at arrivalDay 0, when departure equals arrival", () => {
    const graph = buildGraph([], ["Tatooine"]);
    const result = computeOdds({
      graph,
      autonomy: 6,
      departure: "Tatooine",
      arrival: "Tatooine",
      countdown: 5,
      bountyHunters: [{ planet: "Tatooine", day: 3 }],
    });
    expect(result.arrivalDay).toBe(0);
    expect(result.itinerary).toEqual([{ day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false }]);
  });

  it("labels every wait step correctly and never as refuel when autonomy is 0", () => {
    // With autonomy 0 no jump is ever affordable (every real route requires travelTime >= 1), so
    // the only reachable mission is departure === arrival, and day 0 -- already at the
    // destination with 0 accumulated risk -- is always at least as good as any later day reached
    // purely by waiting (each wait day can only add risk, never remove it). The itinerary is
    // therefore always the single start step; this pins that boundary (fuel-level array of size
    // 1) resolves cleanly and never mislabels it as a refuel.
    const graph = buildGraph([], ["Tatooine"]);
    const result = computeOdds({
      graph,
      autonomy: 0,
      departure: "Tatooine",
      arrival: "Tatooine",
      countdown: 4,
      bountyHunters: [{ planet: "Tatooine", day: 2 }],
    });
    expect(result.itinerary).toEqual([{ day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 0, huntersPresent: false }]);
    expect(result.itinerary!.some((step) => step.action === "refuel")).toBe(false);

    // The other half of the boundary: with a distinct arrival, no jump is affordable at all, so the
    // mission is unreachable rather than yielding a wait-only plan that never leaves the departure.
    const twoPlanets = buildGraph([{ origin: "Tatooine", destination: "Endor", travelTime: 1 }], ["Tatooine", "Endor"]);
    const unreachable = computeOdds({
      graph: twoPlanets,
      autonomy: 0,
      departure: "Tatooine",
      arrival: "Endor",
      countdown: 4,
      bountyHunters: [],
    });
    expect(unreachable.reachable).toBe(false);
    expect(unreachable.itinerary).toBeNull();
    expect(unreachable.arrivalDay).toBeNull();
  });

  it("classifies a self-route (origin === destination) as a jump, never a wait", () => {
    // A -> A (3 days) lets the Falcon skip two risky waiting-days on A in a single transit (transit
    // days are never risk-checked), which a plain wait cannot do -- so it is the unique
    // zero-encounter route to B, and the reconstruction must label it "jump", not "wait".
    const routes: Route[] = [
      { origin: "A", destination: "A", travelTime: 3 },
      { origin: "A", destination: "B", travelTime: 1 },
    ];
    const graph = buildGraph(routes, ["A", "B"]);
    const result = computeOdds({
      graph,
      autonomy: 4,
      departure: "A",
      arrival: "B",
      countdown: 5,
      bountyHunters: [
        { planet: "A", day: 1 },
        { planet: "A", day: 2 },
        { planet: "B", day: 1 },
      ],
    });
    expect(result.minRiskEncounters).toBe(0);
    expect(result.arrivalDay).toBe(4);
    expect(result.itinerary).toEqual([
      { day: 0, planet: "A", action: "start", from: null, fuelAfter: 4, huntersPresent: false },
      { day: 3, planet: "A", action: "jump", from: "A", fuelAfter: 1, huntersPresent: false },
      { day: 4, planet: "B", action: "jump", from: "A", fuelAfter: 0, huntersPresent: false },
    ]);
  });
});
