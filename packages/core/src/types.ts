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

/** Result of the odds-of-success computation. */
export interface OddsResult {
  /** Probability (0..1) that the Falcon reaches the arrival planet in time, undetected. */
  readonly odds: number;
  /** Whether the arrival planet can be reached at or before the countdown at all. */
  readonly reachable: boolean;
  /** Minimum number of risky bounty-hunter encounters along the best route, or null if unreachable. */
  readonly minRiskEncounters: number | null;
}
