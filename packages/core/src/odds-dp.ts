/**
 * The odds search's machinery: the `(day, planet, fuel)` state space, the bounty-hunter risk
 * lookup, the cost tables and the forward sweep that fills them.
 *
 * Nothing here knows about probabilities or itineraries -- `./odds.ts` owns the public contract,
 * turns an encounter count into odds, and reads a filled table back out as a plan. None of this is
 * re-exported from `./index.ts`.
 */
import type { Graph } from "./graph.js";
import type { BountyHunterSighting } from "./types.js";

/**
 * One state of the search -- the triple `(day, planetIdx, fuel)` flattened into a single array
 * index. Branded, because it is structurally just a number: without the brand, `relax(from, to)`
 * would happily accept a day, a fuel level or a planet index in either slot.
 */
export type StateId = number & { readonly __stateId: unique symbol };

/** A `StateId` taken back apart. */
export interface State {
  readonly day: number;
  readonly planetIdx: number;
  readonly fuel: number;
}

/**
 * The `(day, planetIdx, fuel)` grid the search runs on, and the only place its flat-array index
 * arithmetic lives.
 */
export interface StateSpace {
  /** Number of addressable states -- the length every cost array is allocated at. */
  readonly count: number;
  /** Highest addressable day: the mission's countdown. */
  readonly lastDay: number;
  readonly numPlanets: number;
  readonly autonomy: number;
  id(day: number, planetIdx: number, fuel: number): StateId;
  decode(state: StateId): State;
}

export function stateSpace(dimensions: {
  readonly numPlanets: number;
  readonly autonomy: number;
  readonly countdown: number;
}): StateSpace {
  const { numPlanets, autonomy, countdown } = dimensions;
  const planetStride = autonomy + 1; // one slot per fuel level, 0..autonomy inclusive
  const dayStride = numPlanets * planetStride;

  return {
    count: (countdown + 1) * dayStride,
    lastDay: countdown,
    numPlanets,
    autonomy,
    id: (day, planetIdx, fuel) => (day * dayStride + planetIdx * planetStride + fuel) as StateId,
    decode: (state) => {
      const withinDay = state % dayStride;
      return {
        day: Math.floor(state / dayStride),
        planetIdx: Math.floor(withinDay / planetStride),
        fuel: withinDay % planetStride,
      };
    },
  };
}

/** Where and when the Empire has bounty hunters posted. */
export interface RiskTable {
  /** Whether spending `day` on `planetIdx` -- landing there, or sitting there -- is a capture roll. */
  has(planetIdx: number, day: number): boolean;
}

/**
 * Bakes the sightings into a flat bitmap over the mission's `(day, planet)` grid, so the sweep's
 * risk lookup is a single typed-array read.
 *
 * Two sightings of the same planet-day set the same flag, which is what makes a repeated entry in
 * `empire.json` one risk trial rather than two. Sightings the Falcon could never be present for --
 * past the countdown, or on a planet no route mentions -- have no cell and are dropped.
 */
export function riskTable(
  graph: Graph,
  sightings: readonly BountyHunterSighting[],
  lastDay: number,
): RiskTable {
  const numPlanets = graph.planets.length;
  const flags = new Uint8Array((lastDay + 1) * numPlanets);

  for (const sighting of sightings) {
    const planetIdx = graph.planetIndex.get(sighting.planet);
    if (planetIdx === undefined || sighting.day > lastDay) continue;
    flags[sighting.day * numPlanets + planetIdx] = 1;
  }

  return { has: (planetIdx, day) => flags[day * numPlanets + planetIdx] === 1 };
}

/**
 * Which transition produced a state. Stored rather than inferred from "did the planet change",
 * because a degenerate self-route (`origin === destination`) is a jump that lands where it took off.
 * `start` needs no code of its own: it is the one state with no predecessor.
 */
export const Action = { wait: 0, jump: 1 } as const;
export type Action = (typeof Action)[keyof typeof Action];

/** How the best recorded path reached a state. */
export interface Predecessor {
  readonly from: StateId;
  readonly action: Action;
}

/**
 * The filled cost tables: for every state the sweep reached, the fewest bounty-hunter encounters on
 * any path to it, the fewest transitions among *those* paths, and the predecessor achieving both.
 */
export interface DpTable {
  /** Whether the sweep ever reached `state`. */
  isReached(state: StateId): boolean;
  /** Fewest encounters on any path to `state`; `Infinity` when unreached. */
  encountersAt(state: StateId): number;
  /** Transitions on the recorded best path to `state`. */
  stepsAt(state: StateId): number;
  /** The transition that produced `state` -- `null` for the start state, and for unreached states. */
  predecessorOf(state: StateId): Predecessor | null;
}

/** Write side of the tables. Never leaves this module: `sweep` hands back the read-only view. */
interface MutableDpTable extends DpTable {
  /** Marks the start state as reached, with its day-0 risk already counted. */
  seed(state: StateId, encounters: number): void;
  /**
   * Records `from -> to` if it beats what `to` already holds on the lexicographic
   * `(encounters, steps)` cost -- objectives 1 and 3 of the canonical plan. Strict improvement only,
   * so the sweep order decides among equal candidates and no predecessor cycle can form.
   */
  relax(from: StateId, to: StateId, action: Action, riskDelta: 0 | 1): void;
}

const UNREACHED = Infinity;
const NO_PREDECESSOR = -1;

function allocate(count: number): MutableDpTable {
  const encounters = new Float64Array(count).fill(UNREACHED);
  const steps = new Int32Array(count);
  const cameFrom = new Int32Array(count).fill(NO_PREDECESSOR);
  const viaAction = new Int8Array(count);

  return {
    isReached: (state) => encounters[state]! !== UNREACHED,
    encountersAt: (state) => encounters[state]!,
    stepsAt: (state) => steps[state]!,
    predecessorOf: (state) => {
      const from = cameFrom[state]!;
      if (from === NO_PREDECESSOR) return null;
      return { from: from as StateId, action: viaAction[state]! as Action };
    },
    seed: (state, seedEncounters) => {
      encounters[state] = seedEncounters;
    },
    relax: (from, to, action, riskDelta) => {
      const candidateEncounters = encounters[from]! + riskDelta;
      const candidateSteps = steps[from]! + 1;
      const incumbentEncounters = encounters[to]!;
      const wins =
        candidateEncounters < incumbentEncounters ||
        (candidateEncounters === incumbentEncounters && candidateSteps < steps[to]!);
      if (!wins) return;

      encounters[to] = candidateEncounters;
      steps[to] = candidateSteps;
      cameFrom[to] = from;
      viaAction[to] = action;
    },
  };
}

/**
 * Sweeps the whole state space once, in ascending `(day, planetIdx, fuel)` order, relaxing the two
 * things the Falcon can do with a day: spend it on the ground, or spend it in transit.
 *
 * Every transition strictly increases `day`, so the space is a DAG and this order is already
 * topological: when a state is visited, its own cost is final.
 *
 * The order is also the plan's last tie-break, which makes it load-bearing rather than incidental:
 * the loops ascend, waits are relaxed before jumps, and `graph.adjacency` was sorted at build time.
 * Together those make the recorded path a function of the universe, not of route-table row order.
 */
export function sweep(args: {
  readonly graph: Graph;
  readonly space: StateSpace;
  readonly risk: RiskTable;
  readonly departureIdx: number;
}): DpTable {
  const { graph, space, risk, departureIdx } = args;
  const { autonomy, lastDay, numPlanets } = space;
  const table = allocate(space.count);

  table.seed(space.id(0, departureIdx, autonomy), risk.has(departureIdx, 0) ? 1 : 0);

  for (let day = 0; day <= lastDay; day++) {
    for (let planetIdx = 0; planetIdx < numPlanets; planetIdx++) {
      for (let fuel = 0; fuel <= autonomy; fuel++) {
        const state = space.id(day, planetIdx, fuel);
        if (!table.isReached(state)) continue;

        // Stay put for a day. The tank always ends full: the day is spent either way, so topping up
        // is free. Whether that reads as "wait" or "refuel" is a labelling question settled during
        // reconstruction, not a decision the search has to make.
        if (day < lastDay) {
          const tomorrow = space.id(day + 1, planetIdx, autonomy);
          table.relax(state, tomorrow, Action.wait, risk.has(planetIdx, day + 1) ? 1 : 0);
        }

        // Or jump to a neighbour the tank can still reach, landing inside the countdown. Transit
        // days are never risk-checked -- only the landing day is.
        for (const edge of graph.adjacency[planetIdx]!) {
          if (edge.travelTime > fuel) continue;
          const landingDay = day + edge.travelTime;
          if (landingDay > lastDay) continue;
          const landing = space.id(landingDay, edge.to, fuel - edge.travelTime);
          table.relax(state, landing, Action.jump, risk.has(edge.to, landingDay) ? 1 : 0);
        }
      }
    }
  }

  return table;
}

/** The state the plan ends on, with the costs that won it. */
export interface Arrival {
  readonly state: StateId;
  readonly day: number;
  readonly encounters: number;
  readonly steps: number;
}

/**
 * Picks the arrival state the plan ends on: the lexicographic minimum of `(encounters, day, steps)`
 * over every reached state on `arrivalIdx`. `null` means the arrival planet cannot be reached inside
 * the countdown at all -- on no day, with no fuel level.
 */
export function selectArrival(table: DpTable, space: StateSpace, arrivalIdx: number): Arrival | null {
  let best: Arrival | null = null;

  for (let day = 0; day <= space.lastDay; day++) {
    for (let fuel = 0; fuel <= space.autonomy; fuel++) {
      const state = space.id(day, arrivalIdx, fuel);
      if (!table.isReached(state)) continue;
      const candidate: Arrival = {
        state,
        day,
        encounters: table.encountersAt(state),
        steps: table.stepsAt(state),
      };
      if (best === null || beatsArrival(candidate, best)) best = candidate;
    }
  }

  return best;
}

/** Lexicographic `(encounters, day, steps)` order -- objectives 1 to 3 of the canonical plan. */
function beatsArrival(candidate: Arrival, incumbent: Arrival): boolean {
  if (candidate.encounters !== incumbent.encounters) {
    return candidate.encounters < incumbent.encounters;
  }
  if (candidate.day !== incumbent.day) return candidate.day < incumbent.day;
  return candidate.steps < incumbent.steps;
}
