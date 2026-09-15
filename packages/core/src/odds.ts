import type { Graph } from "./graph.js";
import type { BountyHunterSighting, OddsResult } from "./types.js";
import { InvalidConfigError } from "./errors.js";

/** Per-encounter chance of capture, per the bounty hunter formula in the challenge brief. */
const CAPTURE_CHANCE_PER_ENCOUNTER = 0.1;

export interface ComputeOddsParams {
  readonly graph: Graph;
  readonly autonomy: number;
  readonly departure: string;
  readonly arrival: string;
  readonly countdown: number;
  readonly bountyHunters: readonly BountyHunterSighting[];
}

/**
 * Computes the probability that the Millennium Falcon reaches `arrival` at or before
 * `countdown`, minimizing exposure to bounty hunters along the way.
 *
 * Modeled as a forward DP over `(day, planet, fuelRemaining)`. Every day the Falcon
 * physically occupies a planet (departure, a wait/refuel day, or a jump's landing day) is a
 * risk trial if bounty hunters are scheduled there that day. Since capture probability
 * `1 - 0.9^k` is monotonic in the encounter count `k`, minimizing `k` maximizes the odds of
 * success, so the DP tracks the minimum encounter count reachable at each state.
 *
 * `graph` must have been built with `departure` and `arrival` included (see `buildGraph`'s
 * `extraPlanets` parameter) so both are always addressable, even when isolated.
 */
export function computeOdds(params: ComputeOddsParams): OddsResult {
  const { graph, autonomy, departure, arrival, countdown, bountyHunters } = params;

  if (!Number.isInteger(autonomy) || autonomy < 0) {
    throw new InvalidConfigError(`autonomy must be a non-negative integer, got ${autonomy}`);
  }
  if (!Number.isInteger(countdown) || countdown < 0) {
    throw new InvalidConfigError(`countdown must be a non-negative integer, got ${countdown}`);
  }

  const departureIdx = graph.planetIndex.get(departure);
  if (departureIdx === undefined) {
    throw new InvalidConfigError(`departure planet "${departure}" is not present in the graph`);
  }
  const arrivalIdx = graph.planetIndex.get(arrival);
  if (arrivalIdx === undefined) {
    throw new InvalidConfigError(`arrival planet "${arrival}" is not present in the graph`);
  }

  const riskyPlanetDays = new Set<string>();
  for (const sighting of bountyHunters) {
    riskyPlanetDays.add(`${sighting.planet}#${sighting.day}`);
  }
  const isRisky = (planetIdx: number, day: number): boolean =>
    riskyPlanetDays.has(`${graph.planets[planetIdx]}#${day}`);

  const numPlanets = graph.planets.length;
  const fuelLevels = autonomy + 1;
  const planetStride = fuelLevels;
  const dayStride = numPlanets * planetStride;
  const stateIndex = (day: number, planetIdx: number, fuel: number): number =>
    day * dayStride + planetIdx * planetStride + fuel;

  const dp = new Float64Array((countdown + 1) * dayStride).fill(Infinity);
  dp[stateIndex(0, departureIdx, autonomy)] = isRisky(departureIdx, 0) ? 1 : 0;

  for (let day = 0; day <= countdown; day++) {
    for (let planetIdx = 0; planetIdx < numPlanets; planetIdx++) {
      for (let fuel = 0; fuel <= autonomy; fuel++) {
        const current = dp[stateIndex(day, planetIdx, fuel)]!;
        if (!Number.isFinite(current)) continue;

        // Option 1: wait one day (optionally refueling to full -- always beneficial, so we
        // treat every wait as a refuel since it never costs more and never hurts).
        if (day + 1 <= countdown) {
          const nextDay = day + 1;
          const risk = isRisky(planetIdx, nextDay) ? 1 : 0;
          const idx = stateIndex(nextDay, planetIdx, autonomy);
          const candidate = current + risk;
          if (candidate < dp[idx]!) dp[idx] = candidate;
        }

        // Option 2: jump to a neighboring planet, if enough fuel remains.
        for (const edge of graph.adjacency[planetIdx]!) {
          if (edge.travelTime > fuel) continue;
          const nextDay = day + edge.travelTime;
          if (nextDay > countdown) continue;
          const nextFuel = fuel - edge.travelTime;
          const risk = isRisky(edge.to, nextDay) ? 1 : 0;
          const idx = stateIndex(nextDay, edge.to, nextFuel);
          const candidate = current + risk;
          if (candidate < dp[idx]!) dp[idx] = candidate;
        }
      }
    }
  }

  let minRiskEncounters = Infinity;
  for (let day = 0; day <= countdown; day++) {
    for (let fuel = 0; fuel <= autonomy; fuel++) {
      const value = dp[stateIndex(day, arrivalIdx, fuel)]!;
      if (value < minRiskEncounters) minRiskEncounters = value;
    }
  }

  if (!Number.isFinite(minRiskEncounters)) {
    return { odds: 0, reachable: false, minRiskEncounters: null };
  }

  const odds = (1 - CAPTURE_CHANCE_PER_ENCOUNTER) ** minRiskEncounters;
  return { odds, reachable: true, minRiskEncounters };
}
