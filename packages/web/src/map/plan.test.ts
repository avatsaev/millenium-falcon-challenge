import { describe, expect, it } from "vitest";
import type { ItineraryStep } from "../api/types";
import { describeStep, planRouteKeys, planVisits, sightingsByPlanet } from "./plan";

// Verified against a live `@falcon/core` `computeOdds` run for example2 (task-002/task-003), not a
// hand-typed guess: Tatooine (autonomy 6) -> Hoth day 6 (empty tank) -> refuel Hoth day 7 -> Endor day 8.
const EXAMPLE2_ITINERARY: readonly ItineraryStep[] = [
  { day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false },
  { day: 6, planet: "Hoth", action: "jump", from: "Tatooine", fuelAfter: 0, huntersPresent: true },
  { day: 7, planet: "Hoth", action: "refuel", from: null, fuelAfter: 6, huntersPresent: true },
  { day: 8, planet: "Endor", action: "jump", from: "Hoth", fuelAfter: 5, huntersPresent: false },
];

const EXAMPLE2_SIGHTINGS = [
  { planet: "Hoth", day: 6 },
  { planet: "Hoth", day: 7 },
  { planet: "Hoth", day: 8 },
];

describe("planRouteKeys", () => {
  it("is exactly the undirected edges the plan traverses, direction-independent", () => {
    const keys = planRouteKeys(EXAMPLE2_ITINERARY);
    expect(keys).toEqual(new Set(["Hoth|Tatooine", "Endor|Hoth"]));
    expect(keys.has("Dagobah|Tatooine")).toBe(false);
  });

  it("produces one key regardless of which endpoint is listed first", () => {
    const forward: ItineraryStep = { day: 6, planet: "Hoth", action: "jump", from: "Tatooine", fuelAfter: 0, huntersPresent: false };
    const backward: ItineraryStep = { day: 6, planet: "Tatooine", action: "jump", from: "Hoth", fuelAfter: 0, huntersPresent: false };
    expect(planRouteKeys([forward])).toEqual(planRouteKeys([backward]));
  });

  it("ignores non-jump steps", () => {
    const start: ItineraryStep = { day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false };
    const refuel: ItineraryStep = { day: 1, planet: "Tatooine", action: "refuel", from: null, fuelAfter: 6, huntersPresent: false };
    expect(planRouteKeys([start, refuel])).toEqual(new Set());
  });
});

describe("planVisits", () => {
  it("maps each planet to the ascending days the plan is there", () => {
    const visits = planVisits(EXAMPLE2_ITINERARY);
    expect(visits.get("Tatooine")).toEqual([0]);
    expect(visits.get("Hoth")).toEqual([6, 7]);
    expect(visits.get("Endor")).toEqual([8]);
    expect(visits.size).toBe(3);
  });
});

describe("sightingsByPlanet", () => {
  it("maps each planet to its ascending, deduplicated hunter days", () => {
    const byPlanet = sightingsByPlanet(EXAMPLE2_SIGHTINGS);
    expect(byPlanet.get("Hoth")).toEqual([6, 7, 8]);
    expect(byPlanet.size).toBe(1);
  });

  it("deduplicates repeated sightings on the same planet and day", () => {
    const byPlanet = sightingsByPlanet([
      { planet: "Dagobah", day: 3 },
      { planet: "Dagobah", day: 3 },
      { planet: "Dagobah", day: 1 },
    ]);
    expect(byPlanet.get("Dagobah")).toEqual([1, 3]);
  });
});

describe("describeStep", () => {
  it("renders README-shaped prose for every action and never mentions probability", () => {
    const steps: Record<string, ItineraryStep> = {
      start: { day: 0, planet: "Tatooine", action: "start", from: null, fuelAfter: 6, huntersPresent: false },
      jump: { day: 6, planet: "Hoth", action: "jump", from: "Tatooine", fuelAfter: 0, huntersPresent: false },
      refuel: { day: 7, planet: "Hoth", action: "refuel", from: null, fuelAfter: 6, huntersPresent: false },
      wait: { day: 1, planet: "Tatooine", action: "wait", from: null, fuelAfter: 6, huntersPresent: false },
    };

    expect(describeStep(steps["start"]!)).toBe("Day 0 — parked on Tatooine, tank full.");
    expect(describeStep(steps["jump"]!)).toBe("Day 6 — travel from Tatooine to Hoth.");
    expect(describeStep(steps["refuel"]!)).toBe("Day 7 — refuel on Hoth.");
    expect(describeStep(steps["wait"]!)).toBe("Day 1 — wait on Tatooine.");

    for (const step of Object.values(steps)) {
      const text = describeStep(step);
      expect(text).not.toContain("%");
      expect(text.toLowerCase()).not.toContain("captured");
    }
  });
});
