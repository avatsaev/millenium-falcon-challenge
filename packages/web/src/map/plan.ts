/**
 * Pure derivations over an itinerary and a bounty-hunter schedule — no React, no formatting beyond
 * README-shaped prose. See `swe/specs/features/universe-map.md` § Data shapes consumed.
 */

import type { ItineraryStep } from "../api/types";

/** Undirected edge key with endpoints sorted, so a route's direction of travel never matters — the
 * same convention `StarMap` uses for `data-route`. */
export function routeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The undirected route keys (`"A|B"`, endpoints sorted) the plan actually traverses. */
export function planRouteKeys(itinerary: readonly ItineraryStep[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const step of itinerary) {
    if (step.action === "jump" && step.from !== null) {
      keys.add(routeKey(step.from, step.planet));
    }
  }
  return keys;
}

/** Planet name to the ascending list of days the plan has the Falcon there. */
export function planVisits(itinerary: readonly ItineraryStep[]): ReadonlyMap<string, number[]> {
  const visits = new Map<string, number[]>();
  for (const step of itinerary) {
    const days = visits.get(step.planet);
    if (days) {
      days.push(step.day);
    } else {
      visits.set(step.planet, [step.day]);
    }
  }
  for (const days of visits.values()) days.sort((a, b) => a - b);
  return visits;
}

/** Planet name to the ascending, deduplicated list of days bounty hunters are scheduled there. */
export function sightingsByPlanet(sightings: readonly { readonly planet: string; readonly day: number }[]): ReadonlyMap<string, number[]> {
  const byPlanet = new Map<string, Set<number>>();
  for (const sighting of sightings) {
    const days = byPlanet.get(sighting.planet);
    if (days) {
      days.add(sighting.day);
    } else {
      byPlanet.set(sighting.planet, new Set([sighting.day]));
    }
  }
  const result = new Map<string, number[]>();
  for (const [planet, days] of byPlanet) result.set(planet, [...days].sort((a, b) => a - b));
  return result;
}

/** README-shaped one-line prose for a single itinerary step. No probability text, ever. */
export function describeStep(step: ItineraryStep): string {
  switch (step.action) {
    case "start":
      return `Day ${step.day} — parked on ${step.planet}, tank full.`;
    case "jump":
      return `Day ${step.day} — travel from ${step.from} to ${step.planet}.`;
    case "refuel":
      return `Day ${step.day} — refuel on ${step.planet}.`;
    case "wait":
      return `Day ${step.day} — wait on ${step.planet}.`;
  }
}
