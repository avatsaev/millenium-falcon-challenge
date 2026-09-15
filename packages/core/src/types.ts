/** Millennium Falcon onboard configuration (millennium-falcon.json). */
export interface FalconConfig {
  /** Maximum fuel tank capacity, in days of travel. */
  readonly autonomy: number;
  /** Planet the Falcon is parked on at day 0. */
  readonly departure: string;
  /** Planet the Falcon must reach at or before the countdown. */
  readonly arrival: string;
  /** Absolute path to the SQLite routes database (resolved against the config file's directory). */
  readonly routesDb: string;
}

/** A single hyperspace route between two planets, travelable in either direction. */
export interface Route {
  readonly origin: string;
  readonly destination: string;
  readonly travelTime: number;
}

/** A day/planet where the Empire has scheduled bounty hunters to be present. */
export interface BountyHunterSighting {
  readonly planet: string;
  readonly day: number;
}

/** Intercepted Empire intelligence (empire.json). */
export interface EmpireConfig {
  /** Number of days before the Death Star annihilates the arrival planet. */
  readonly countdown: number;
  readonly bountyHunters: readonly BountyHunterSighting[];
}

/** One day-stamped action in the Falcon's plan. */
export interface ItineraryStep {
  /** Day the Falcon is on `planet` once this action completes (0 for the initial parked state). */
  readonly day: number;
  readonly planet: string;
  readonly action: "start" | "jump" | "wait" | "refuel";
  /** Planet left behind -- `jump` steps only, else null. */
  readonly from: string | null;
  /** Fuel in the tank once the action completes, in days of travel. */
  readonly fuelAfter: number;
  /** Bounty hunters scheduled on `planet` that `day` -- i.e. a 10% capture roll happened here. */
  readonly huntersPresent: boolean;
}

/** Result of the odds-of-success computation. */
export interface OddsResult {
  /** Probability (0..1) that the Falcon reaches the arrival planet in time, undetected. */
  readonly odds: number;
  /** Whether the arrival planet can be reached at or before the countdown at all. */
  readonly reachable: boolean;
  /** Minimum number of risky bounty-hunter encounters along the best route, or null if unreachable. */
  readonly minRiskEncounters: number | null;
  /** Day the Falcon lands on the arrival planet, or null if unreachable. */
  readonly arrivalDay: number | null;
  /** The canonical day-by-day plan, or null if unreachable. */
  readonly itinerary: readonly ItineraryStep[] | null;
}
