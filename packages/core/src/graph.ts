import type { Route } from "./types.js";

export interface GraphEdge {
  readonly to: number;
  readonly travelTime: number;
}

/** Undirected planet graph built from the routes table, indexed for fast DP access. */
export interface Graph {
  /** Planet name for each index. */
  readonly planets: readonly string[];
  /** Planet index by name. */
  readonly planetIndex: ReadonlyMap<string, number>;
  /** Outgoing edges (both directions of every route) per planet index. */
  readonly adjacency: readonly (readonly GraphEdge[])[];
}

/**
 * Builds an undirected graph from the routes table. `extraPlanets` are guaranteed to be
 * present in the graph (as isolated nodes if necessary) even if no route references them --
 * used to make sure departure/arrival are always addressable.
 */
export function buildGraph(routes: readonly Route[], extraPlanets: readonly string[] = []): Graph {
  const planetIndex = new Map<string, number>();
  const planets: string[] = [];

  const ensure = (name: string): number => {
    let idx = planetIndex.get(name);
    if (idx === undefined) {
      idx = planets.length;
      planetIndex.set(name, idx);
      planets.push(name);
    }
    return idx;
  };

  for (const name of extraPlanets) ensure(name);
  for (const route of routes) {
    ensure(route.origin);
    ensure(route.destination);
  }

  const adjacency: GraphEdge[][] = planets.map(() => []);
  for (const route of routes) {
    const originIdx = ensure(route.origin);
    const destinationIdx = ensure(route.destination);
    adjacency[originIdx]!.push({ to: destinationIdx, travelTime: route.travelTime });
    adjacency[destinationIdx]!.push({ to: originIdx, travelTime: route.travelTime });
  }

  return { planets, planetIndex, adjacency };
}
