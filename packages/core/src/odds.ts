import type { Graph } from "./graph.js";
import type { BountyHunterSighting, ItineraryStep, OddsResult } from "./types.js";
import { InvalidConfigError } from "./errors.js";
import { compareStrings } from "./compare.js";
import {
  Action,
  riskTable,
  selectArrival,
  stateSpace,
  sweep,
  type DpTable,
  type Predecessor,
  type RiskTable,
  type StateId,
  type StateSpace,
} from "./odds-dp.js";

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
 * Collapses raw bounty-hunter sightings to one entry per `{planet, day}` pair, sorted by
 * `(day asc, planet asc)` -- the canonical schedule the API echoes to the frontend for display.
 *
 * The search does not consume this: `riskTable` flattens sightings into a bitmap, where a repeat is
 * idempotent by construction. Both therefore agree on "one risk trial per planet-day" without one
 * depending on the other.
 */
export function dedupeSightings(sightings: readonly BountyHunterSighting[]): BountyHunterSighting[] {
  const byPlanetDay = new Map<string, BountyHunterSighting>();
  for (const sighting of sightings) {
    // Day first: it holds no `#`, so the delimiter is unambiguous and the key is injective. The
    // other order would let a planet named `Hoth#6` alias the pair `{Hoth, 6}`.
    byPlanetDay.set(`${sighting.day}#${sighting.planet}`, sighting);
  }
  return [...byPlanetDay.values()].sort(
    (a, b) => a.day - b.day || compareStrings(a.planet, b.planet),
  );
}

/**
 * Computes the probability that the Millennium Falcon reaches `arrival` at or before `countdown`,
 * and the canonical day-by-day plan that achieves it.
 *
 * Capture probability is `1 - 0.9^k` in the number of bounty-hunter encounters `k`, and monotonic in
 * `k` -- so the search minimises encounters and never touches a float until the very last line. An
 * encounter is counted for every day the Falcon *occupies* a planet the Empire has posted hunters on:
 * day 0 on `departure`, every day spent waiting or refuelling, and a jump's landing day. Days in
 * transit are never checked.
 *
 * Among equally safe plans, the one reported is the lexicographic minimum of
 * `(encounters, arrivalDay, steps, sweep order)`; see `swe/specs/architecture/odds-algorithm.md`
 * §Canonical plan. The search itself -- state space, sweep, arrival choice -- lives in `./odds-dp.ts`.
 *
 * `graph` must have been built with `departure` and `arrival` included (`buildGraph`'s
 * `extraPlanets`), so both are addressable even when no route mentions them.
 *
 * @throws InvalidConfigError when `autonomy` or `countdown` is not a non-negative integer, or an
 * endpoint is missing from the graph.
 */
export function computeOdds(params: ComputeOddsParams): OddsResult {
  const { graph, autonomy, departure, arrival, countdown, bountyHunters } = params;
  requireNonNegativeInt(autonomy, "autonomy");
  requireNonNegativeInt(countdown, "countdown");
  const departureIdx = requirePlanet(graph, departure, "departure");
  const arrivalIdx = requirePlanet(graph, arrival, "arrival");

  const space = stateSpace({ numPlanets: graph.planets.length, autonomy, countdown });
  const risk = riskTable(graph, bountyHunters, countdown);
  const table = sweep({ graph, space, risk, departureIdx });

  const best = selectArrival(table, space, arrivalIdx);
  if (best === null) {
    return { odds: 0, reachable: false, minRiskEncounters: null, arrivalDay: null, itinerary: null };
  }

  return {
    odds: (1 - CAPTURE_CHANCE_PER_ENCOUNTER) ** best.encounters,
    reachable: true,
    minRiskEncounters: best.encounters,
    arrivalDay: best.day,
    itinerary: reconstructItinerary({
      table,
      space,
      graph,
      risk,
      autonomy,
      arrivalState: best.state,
    }),
  };
}

function requireNonNegativeInt(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidConfigError(`${field} must be a non-negative integer, got ${value}`);
  }
}

function requirePlanet(graph: Graph, planet: string, role: string): number {
  const planetIdx = graph.planetIndex.get(planet);
  if (planetIdx === undefined) {
    throw new InvalidConfigError(`${role} planet "${planet}" is not present in the graph`);
  }
  return planetIdx;
}

/** Walks the recorded predecessors back from the arrival state, then reads the plan out forwards. */
function reconstructItinerary(args: {
  readonly table: DpTable;
  readonly space: StateSpace;
  readonly graph: Graph;
  readonly risk: RiskTable;
  readonly autonomy: number;
  readonly arrivalState: StateId;
}): ItineraryStep[] {
  const { table, space, graph, risk, autonomy, arrivalState } = args;

  const plan: ItineraryStep[] = [];
  let state: StateId | null = arrivalState;
  while (state !== null) {
    const { day, planetIdx, fuel } = space.decode(state);
    const predecessor = table.predecessorOf(state);
    const { action, from } = describeTransition(predecessor, { space, graph, autonomy });

    plan.push({
      day,
      planet: graph.planets[planetIdx]!,
      action,
      from,
      fuelAfter: fuel,
      huntersPresent: risk.has(planetIdx, day),
    });
    state = predecessor?.from ?? null;
  }

  return plan.reverse();
}

/**
 * The action that put the Falcon where it now is, and the planet it came from.
 *
 * `start` is the state with no predecessor. `wait` versus `refuel` is not something the search
 * tracks -- a day on the ground always ends with a full tank -- so it is recovered here: the Falcon
 * refuelled exactly when the tank was not already full when the day began.
 */
function describeTransition(
  predecessor: Predecessor | null,
  context: { readonly space: StateSpace; readonly graph: Graph; readonly autonomy: number },
): { readonly action: ItineraryStep["action"]; readonly from: string | null } {
  if (predecessor === null) return { action: "start", from: null };

  const origin = context.space.decode(predecessor.from);
  if (predecessor.action === Action.jump) {
    return { action: "jump", from: context.graph.planets[origin.planetIdx]! };
  }
  return { action: origin.fuel < context.autonomy ? "refuel" : "wait", from: null };
}
