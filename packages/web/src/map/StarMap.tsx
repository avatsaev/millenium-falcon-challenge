import { useMemo } from "react";
import { Crosshair, Rocket, Target } from "lucide-react";
import type { ItineraryStep, Universe } from "../api/types";
import { layoutUniverse } from "./layout";
import { planRouteKeys, planVisits, routeKey, sightingsByPlanet } from "./plan";

export interface StarMapProps {
  readonly universe: Universe;
  readonly itinerary: readonly ItineraryStep[] | null;
  readonly sightings: readonly { readonly planet: string; readonly day: number }[];
}

// The `<svg viewBox="0 0 1000 620">` is typically rendered around 60-65% of that width on screen (it
// shares the page with an 18rem details rail), so every size below is chosen to still read clearly
// after that shrink — roughly 1.5x the CSS-pixel value that would look right unscaled.
const PLANET_RADIUS = 30;
const HUNTER_RING_RADIUS = PLANET_RADIUS + 10;
const ICON_SIZE = 30;
const PLANET_LABEL_SIZE = 26;
const ROUTE_LABEL_SIZE = 22;
const HUNTER_DAYS_LABEL_SIZE = 20;
const VISIT_STAMP_SIZE = 24;

type PlanetRole = "departure" | "arrival" | "waypoint" | "none";

/**
 * The static universe diagram — see `swe/specs/features/universe-map.md` § Star map rendering.
 * A pure function of `universe`, `itinerary` and `sightings`: no component state, no animation.
 */
export function StarMap({ universe, itinerary, sightings }: StarMapProps): React.JSX.Element {
  const positions = useMemo(() => layoutUniverse(universe.planets, universe.routes, { padding: 90 }), [universe]);
  const onPlanKeys = useMemo(() => planRouteKeys(itinerary ?? []), [itinerary]);
  const visits = useMemo(() => planVisits(itinerary ?? []), [itinerary]);
  const hunterDays = useMemo(() => sightingsByPlanet(sightings), [sightings]);

  const planetNames = [...positions.keys()];
  const falconPosition = positions.get(universe.departure);

  return (
    <svg viewBox="0 0 1000 620" className="w-full" data-testid="star-map">
      {universe.routes.map((route) => {
        const from = positions.get(route.origin);
        const to = positions.get(route.destination);
        if (!from || !to) return null;
        const key = routeKey(route.origin, route.destination);
        const onPlan = onPlanKeys.has(key);
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        return (
          <g key={key}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              data-route={key}
              data-travel-time={route.travelTime}
              data-on-plan={onPlan ? "true" : "false"}
              className={onPlan ? "text-gold" : "text-seam"}
              stroke="currentColor"
              strokeWidth={onPlan ? 7 : 3}
            />
            <text
              x={midX}
              y={midY}
              textAnchor="middle"
              className="fill-current text-dim"
              style={{ fontSize: ROUTE_LABEL_SIZE, paintOrder: "stroke", stroke: "var(--color-hull)", strokeWidth: 4 }}
            >
              {route.travelTime}d
            </text>
          </g>
        );
      })}

      {planetNames.map((name) => {
        const position = positions.get(name)!;
        const role: PlanetRole =
          name === universe.departure ? "departure" : name === universe.arrival ? "arrival" : visits.has(name) ? "waypoint" : "none";
        const days = hunterDays.get(name);
        const hasHunters = days !== undefined && days.length > 0;
        const visitDays = visits.get(name) ?? [];

        return (
          <g
            key={name}
            data-planet={name}
            data-role={role}
            data-hunters={hasHunters ? "true" : "false"}
            data-visit-days={visitDays.join(",")}
          >
            <circle
              cx={position.x}
              cy={position.y}
              r={PLANET_RADIUS}
              className={role === "none" ? "text-dim" : "text-starlight"}
              fill="currentColor"
            />
            {hasHunters && (
              <circle
                cx={position.x}
                cy={position.y}
                r={HUNTER_RING_RADIUS}
                className="text-alert"
                stroke="currentColor"
                strokeWidth={4}
                fill="none"
              />
            )}
            <text
              x={position.x}
              y={position.y + PLANET_RADIUS + 28}
              textAnchor="middle"
              className="fill-current font-semibold text-starlight"
              style={{ fontSize: PLANET_LABEL_SIZE }}
            >
              {name}
            </text>

            {role === "departure" && (
              <foreignObject x={position.x - PLANET_RADIUS - ICON_SIZE - 4} y={position.y - ICON_SIZE - 8} width={ICON_SIZE} height={ICON_SIZE}>
                <Rocket className="size-full text-gold" aria-hidden />
              </foreignObject>
            )}
            {role === "arrival" && (
              <foreignObject x={position.x - PLANET_RADIUS - ICON_SIZE - 4} y={position.y - ICON_SIZE - 8} width={ICON_SIZE} height={ICON_SIZE}>
                <Target className="size-full text-go" aria-hidden />
              </foreignObject>
            )}
            {hasHunters && (
              <>
                <foreignObject x={position.x + PLANET_RADIUS + 4} y={position.y - ICON_SIZE - 8} width={ICON_SIZE} height={ICON_SIZE}>
                  <Crosshair className="size-full text-alert" aria-hidden />
                </foreignObject>
                <text
                  x={position.x}
                  y={position.y - PLANET_RADIUS - 16}
                  textAnchor="middle"
                  className="fill-current font-semibold text-alert"
                  style={{ fontSize: HUNTER_DAYS_LABEL_SIZE }}
                >
                  {days.map((day) => `d${day}`).join(", ")}
                </text>
              </>
            )}
            {visitDays.length > 0 && (
              <text
                x={position.x}
                y={position.y + 8}
                textAnchor="middle"
                className="fill-current font-bold text-hull"
                style={{ fontSize: VISIT_STAMP_SIZE }}
              >
                {visitDays.join(",")}
              </text>
            )}
          </g>
        );
      })}

      {falconPosition && (
        <g data-testid="falcon" data-planet={universe.departure}>
          <foreignObject
            x={falconPosition.x - ICON_SIZE / 2}
            y={falconPosition.y - PLANET_RADIUS - ICON_SIZE - 12}
            width={ICON_SIZE}
            height={ICON_SIZE}
          >
            <Rocket className="size-full text-starlight" aria-hidden />
          </foreignObject>
        </g>
      )}
    </svg>
  );
}
