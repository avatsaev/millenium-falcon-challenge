import { Crosshair } from "lucide-react";
import type { OddsResponse, Universe } from "../api/types";
import { describeStep, sightingsByPlanet } from "./plan";

export interface MapDetailsProps {
  readonly universe: Universe;
  readonly result: OddsResponse | undefined;
}

/**
 * The rail beside the map — mission facts, the plan (when reachable), the hunter schedule and any
 * off-map sighting. See `swe/specs/features/universe-map.md` § Details list. A pure function of
 * `universe` and `result`; `result` is `undefined` before the first successful upload.
 */
export function MapDetails({ universe, result }: MapDetailsProps): React.JSX.Element {
  const sightings = result?.bountyHunters ?? [];
  const knownPlanets = new Set(universe.planets);
  const onMapSightings = sightings.filter((sighting) => knownPlanets.has(sighting.planet));
  const offMapSightings = sightings.filter((sighting) => !knownPlanets.has(sighting.planet));
  const hunterDays = sightingsByPlanet(onMapSightings);

  return (
    <div className="flex flex-col gap-4 text-sm text-dim">
      <section data-testid="mission">
        <h2 className="font-semibold text-starlight">Mission</h2>
        <p>
          {universe.departure} → {universe.arrival}, autonomy {universe.autonomy} day{universe.autonomy === 1 ? "" : "s"}.
        </p>
        {result && (
          <p>
            Countdown {result.countdown} day{result.countdown === 1 ? "" : "s"}
            {result.arrivalDay !== null ? `, arriving day ${result.arrivalDay}.` : "."}
          </p>
        )}
        {!result && <p>Upload empire.json to see the Empire&apos;s positions and the Falcon&apos;s route.</p>}
      </section>

      {result?.itinerary && result.itinerary.length > 0 && (
        <section>
          <h2 className="font-semibold text-starlight">Plan</h2>
          <ol data-testid="plan" className="list-decimal space-y-1 pl-5">
            {result.itinerary.map((step) => (
              <li key={`${step.day}-${step.planet}-${step.action}`} data-step-day={step.day} data-action={step.action}>
                {describeStep(step)}
              </li>
            ))}
          </ol>
        </section>
      )}

      {result && hunterDays.size > 0 && (
        <section data-testid="hunters">
          <h2 className="flex items-center gap-2 font-semibold text-starlight">
            <Crosshair className="size-4 text-alert" aria-hidden />
            Bounty hunters
          </h2>
          <ul className="space-y-1">
            {[...hunterDays].map(([planet, days]) => (
              <li key={planet}>
                {planet} — day{days.length === 1 ? "" : "s"} {days.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && offMapSightings.length > 0 && (
        <section data-testid="off-map-sightings">
          <h2 className="font-semibold text-starlight">Off-map sightings</h2>
          <ul className="space-y-1">
            {[...sightingsByPlanet(offMapSightings)].map(([planet, days]) => (
              <li key={planet}>
                {planet} — day{days.length === 1 ? "" : "s"} {days.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
