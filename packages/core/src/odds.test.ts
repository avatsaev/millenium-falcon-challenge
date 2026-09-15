import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isRecord } from "./guards.js";
import { buildGraph } from "./graph.js";
import { computeOdds } from "./odds.js";
import { loadEmpireConfig, loadFalconConfig } from "./config.js";
import { loadRoutes } from "./routes-db.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "..", "..", "examples");

async function runExample(name: string): Promise<number> {
  const dir = join(examplesDir, name);
  const falconConfig = await loadFalconConfig(join(dir, "millennium-falcon.json"));
  const empireConfig = await loadEmpireConfig(join(dir, "empire.json"));
  const routes = loadRoutes(falconConfig.routesDb);
  const graph = buildGraph(routes, [falconConfig.departure, falconConfig.arrival]);
  const result = computeOdds({
    graph,
    autonomy: falconConfig.autonomy,
    departure: falconConfig.departure,
    arrival: falconConfig.arrival,
    countdown: empireConfig.countdown,
    bountyHunters: empireConfig.bountyHunters,
  });
  return result.odds;
}

async function expectedOdds(name: string): Promise<number> {
  const raw = await readFile(join(examplesDir, name, "answer.json"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || typeof parsed["odds"] !== "number") {
    throw new Error(`answer.json for ${name} must be an object with a numeric "odds" field`);
  }
  return parsed["odds"];
}

describe("computeOdds against the README examples", () => {
  for (const name of ["example1", "example2", "example3", "example4"]) {
    it(`matches ${name}/answer.json`, async () => {
      const [actual, expected] = await Promise.all([runExample(name), expectedOdds(name)]);
      expect(actual).toBeCloseTo(expected, 9);
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
    expect(result).toEqual({ odds: 1, reachable: true, minRiskEncounters: 0 });
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
    expect(result).toEqual({ odds: 0, reachable: false, minRiskEncounters: null });
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
});
