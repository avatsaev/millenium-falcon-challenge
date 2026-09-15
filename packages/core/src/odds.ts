import type { Graph } from "./graph.js";
import type { BountyHunterSighting, ItineraryStep, OddsResult } from "./types.js";
import { InvalidConfigError } from "./errors.js";

/** Per-encounter chance of capture, per the bounty hunter formula in the challenge brief. */
const CAPTURE_CHANCE_PER_ENCOUNTER = 0.1;

/** DP `prevAction` codes, stored (not inferred) so a self-route jump can't be misread as a wait. */
const ACTION_START = 0;
const ACTION_WAIT_OR_REFUEL = 1;
const ACTION_JUMP = 2;

export interface ComputeOddsParams {
  readonly graph: Graph;
  readonly autonomy: number;
  readonly departure: string;
  readonly arrival: string;
  readonly countdown: number;
  readonly bountyHunters: readonly BountyHunterSighting[];
}

/**
 * Collapses raw bounty-hunter sightings to one entry per `{planet, day}` pair, sorted by
 * `(day asc, planet asc)`. Exported so the API can echo the same canonical schedule it fed the DP
 * -- one definition of "one risk trial per planet-day", shared by the algorithm and the display.
 */
export function dedupeSightings(sightings: readonly BountyHunterSighting[]): BountyHunterSighting[] {
  const byKey = new Map<string, BountyHunterSighting>();
  for (const sighting of sightings) {
    byKey.set(`${sighting.planet}#${sighting.day}`, sighting);
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.planet < b.planet ? -1 : a.planet > b.planet ? 1 : 0;
  });
}

/**
 * Computes the probability that the Millennium Falcon reaches `arrival` at or before
 * `countdown`, minimizing exposure to bounty hunters along the way, and the canonical day-by-day
 * plan that achieves it.
 *
 * Modeled as a forward DP over `(day, planet, fuelRemaining)`. Every day the Falcon physically
 * occupies a planet (departure, a wait/refuel day, or a jump's landing day) is a risk trial if
 * bounty hunters are scheduled there that day. Since capture probability `1 - 0.9^k` is monotonic
 * in the encounter count `k`, minimizing `k` maximizes the odds of success, so the DP tracks the
 * minimum encounter count reachable at each state.
 *
 * Alongside the encounter-count DP, three parallel arrays record enough to reconstruct the plan:
 * `stepCount` (fewest transitions among the minimum-encounter paths reaching a state), `prev`
 * (predecessor state index) and `prevAction` (start/wait-or-refuel/jump). The chosen plan is the
 * lexicographic minimum of `(encounters, arrivalDay, stepCount, sweepOrder)` -- encounters and
 * stepCount are per-state DP costs relaxed by the single ascending `(day, planetIndex, fuel)`
 * sweep (waits before jumps, adjacency pre-sorted), arrivalDay is applied when picking the best
 * arrival state, and sweepOrder is first-writer-wins.
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
  for (const sighting of dedupeSightings(bountyHunters)) {
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
  const decodeState = (idx: number): { day: number; planetIdx: number; fuel: number } => {
    const day = Math.floor(idx / dayStride);
    const rem = idx % dayStride;
    const planetIdx = Math.floor(rem / planetStride);
    const fuel = rem % planetStride;
    return { day, planetIdx, fuel };
  };

  const stateCount = (countdown + 1) * dayStride;
  const dp = new Float64Array(stateCount).fill(Infinity);
  const stepCount = new Int32Array(stateCount);
  const prev = new Int32Array(stateCount).fill(-1);
  const prevAction = new Int8Array(stateCount);

  const startIdx = stateIndex(0, departureIdx, autonomy);
  dp[startIdx] = isRisky(departureIdx, 0) ? 1 : 0;
  stepCount[startIdx] = 0;
  prev[startIdx] = -1;
  prevAction[startIdx] = ACTION_START;

  const relax = (targetIdx: number, candidateEncounters: number, candidateSteps: number, sourceIdx: number, action: number): void => {
    const incumbentEncounters = dp[targetIdx]!;
    if (candidateEncounters < incumbentEncounters || (candidateEncounters === incumbentEncounters && candidateSteps < stepCount[targetIdx]!)) {
      dp[targetIdx] = candidateEncounters;
      stepCount[targetIdx] = candidateSteps;
      prev[targetIdx] = sourceIdx;
      prevAction[targetIdx] = action;
    }
  };

  for (let day = 0; day <= countdown; day++) {
    for (let planetIdx = 0; planetIdx < numPlanets; planetIdx++) {
      for (let fuel = 0; fuel <= autonomy; fuel++) {
        const stateIdx = stateIndex(day, planetIdx, fuel);
        const currentEncounters = dp[stateIdx]!;
        if (!Number.isFinite(currentEncounters)) continue;
        const currentSteps = stepCount[stateIdx]!;

        // Option 1: wait one day, always refueling to full (free once the day is spent). The
        // wait/refuel label is recovered at reconstruction time, not tracked here.
        if (day + 1 <= countdown) {
          const nextDay = day + 1;
          const risk = isRisky(planetIdx, nextDay) ? 1 : 0;
          const targetIdx = stateIndex(nextDay, planetIdx, autonomy);
          relax(targetIdx, currentEncounters + risk, currentSteps + 1, stateIdx, ACTION_WAIT_OR_REFUEL);
        }

        // Option 2: jump to a neighboring planet, if enough fuel remains (adjacency pre-sorted).
        for (const edge of graph.adjacency[planetIdx]!) {
          if (edge.travelTime > fuel) continue;
          const nextDay = day + edge.travelTime;
          if (nextDay > countdown) continue;
          const nextFuel = fuel - edge.travelTime;
          const risk = isRisky(edge.to, nextDay) ? 1 : 0;
          const targetIdx = stateIndex(nextDay, edge.to, nextFuel);
          relax(targetIdx, currentEncounters + risk, currentSteps + 1, stateIdx, ACTION_JUMP);
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
    return { odds: 0, reachable: false, minRiskEncounters: null, arrivalDay: null, itinerary: null };
  }

  // Best arrival state: earliest day at which the global minimum encounter count is attained,
  // breaking ties among that day's fuel levels by lowest step count.
  let arrivalDay = -1;
  let bestState = -1;
  for (let day = 0; day <= countdown && arrivalDay === -1; day++) {
    let dayBestState = -1;
    let dayBestSteps = Infinity;
    for (let fuel = 0; fuel <= autonomy; fuel++) {
      const idx = stateIndex(day, arrivalIdx, fuel);
      if (dp[idx] === minRiskEncounters && stepCount[idx]! < dayBestSteps) {
        dayBestSteps = stepCount[idx]!;
        dayBestState = idx;
      }
    }
    if (dayBestState !== -1) {
      arrivalDay = day;
      bestState = dayBestState;
    }
  }

  const chain: number[] = [];
  for (let cur = bestState; cur !== -1; cur = prev[cur]!) chain.push(cur);
  chain.reverse();

  const itinerary: ItineraryStep[] = chain.map((idx, i) => {
    const { day, planetIdx, fuel } = decodeState(idx);
    const planet = graph.planets[planetIdx]!;
    const action = prevAction[idx]!;

    if (action === ACTION_START) {
      return { day, planet, action: "start", from: null, fuelAfter: fuel, huntersPresent: isRisky(planetIdx, day) };
    }
    const prevDecoded = decodeState(chain[i - 1]!);
    if (action === ACTION_JUMP) {
      const from = graph.planets[prevDecoded.planetIdx]!;
      return { day, planet, action: "jump", from, fuelAfter: fuel, huntersPresent: isRisky(planetIdx, day) };
    }
    // ACTION_WAIT_OR_REFUEL: a refuel iff the predecessor's fuel was below capacity.
    const label = prevDecoded.fuel < autonomy ? "refuel" : "wait";
    return { day, planet, action: label, from: null, fuelAfter: fuel, huntersPresent: isRisky(planetIdx, day) };
  });

  const odds = (1 - CAPTURE_CHANCE_PER_ENCOUNTER) ** minRiskEncounters;
  return { odds, reachable: true, minRiskEncounters, arrivalDay, itinerary };
}
