import { buildGraph, computeOdds, loadEmpireConfig, loadFalconConfig, loadRoutes } from "@falcon/core";

/**
 * Computes the Millennium Falcon's odds of success, rounded to the nearest integer
 * percentage (0-100), from the two challenge config files.
 */
export async function computeOddsPercent(falconConfigPath: string, empireConfigPath: string): Promise<number> {
  const falconConfig = await loadFalconConfig(falconConfigPath);
  const empireConfig = await loadEmpireConfig(empireConfigPath);
  const routes = loadRoutes(falconConfig.routesDb);
  const graph = buildGraph(routes, [falconConfig.departure, falconConfig.arrival]);
  const result = computeOdds({
    graph,
    autonomy: falconConfig.autonomy,
    departure: falconConfig.departure,
    arrival: falconConfig.arrival,
    countdown: empireConfig.countdown,
    bountyHunters: empireConfig.bountyHunters,
  });
  return Math.round(result.odds * 100);
}
