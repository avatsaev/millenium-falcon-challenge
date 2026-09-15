/**
 * The wire shapes of `@falcon/api`, re-declared by hand: `@falcon/web` deliberately does not depend on
 * `@falcon/core`, so these must be kept in step with `packages/api/src/app.ts` when the payload changes.
 * Types only - the map panel needs the shapes without pulling in `fetch`.
 */

/** One day-stamped action in the Falcon's plan, mirroring `@falcon/core`'s `ItineraryStep`. */
export interface ItineraryStep {
  readonly day: number;
  readonly planet: string;
  readonly action: "start" | "jump" | "wait" | "refuel";
  readonly from: string | null;
  readonly fuelAfter: number;
  readonly huntersPresent: boolean;
}

/** `GET /api/universe`: the ship's config plus the graph the odds were computed on. */
export interface Universe {
  readonly departure: string;
  readonly arrival: string;
  readonly autonomy: number;
  readonly planets: readonly string[];
  readonly routes: readonly { readonly origin: string; readonly destination: string; readonly travelTime: number }[];
}

/** `POST /api/odds`: the odds, the mission intel echoed back, and the canonical plan. */
export interface OddsResponse {
  readonly odds: number;
  readonly oddsPercent: number;
  readonly reachable: boolean;
  readonly minRiskEncounters: number | null;
  readonly arrivalDay: number | null;
  readonly countdown: number;
  readonly bountyHunters: readonly { readonly planet: string; readonly day: number }[];
  readonly itinerary: readonly ItineraryStep[] | null;
}
