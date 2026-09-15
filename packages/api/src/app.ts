import { existsSync } from "node:fs";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import {
  InvalidConfigError,
  computeOdds,
  dedupeSightings,
  parseEmpireConfig,
  type BountyHunterSighting,
  type FalconConfig,
  type Graph,
  type ItineraryStep,
} from "@falcon/core";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

export interface RouteRow {
  readonly origin: string;
  readonly destination: string;
  readonly travelTime: number;
}

/** `GET /api/universe`: the boot-scoped mission, plus the graph the odds are computed on. */
export interface UniverseResponse {
  readonly departure: string;
  readonly arrival: string;
  readonly autonomy: number;
  readonly planets: readonly string[];
  readonly routes: readonly RouteRow[];
}

/** `POST /api/odds`: the odds, the mission intel they were derived from, and the canonical plan. */
export interface OddsResponse {
  readonly odds: number;
  readonly oddsPercent: number;
  readonly reachable: boolean;
  readonly minRiskEncounters: number | null;
  readonly arrivalDay: number | null;
  readonly countdown: number;
  readonly bountyHunters: readonly BountyHunterSighting[];
  readonly itinerary: readonly ItineraryStep[] | null;
}

/** The only error shape the API sends. */
export interface ErrorResponse {
  readonly error: string;
}

/**
 * Collapses the graph's directed adjacency back to one row per undirected route (each route is
 * stored both ways), sorted by `(origin asc, destination asc)` so the response is deterministic
 * across requests regardless of insertion order.
 */
function undirectedRoutes(graph: Graph): RouteRow[] {
  const rows: RouteRow[] = [];
  for (let planetIdx = 0; planetIdx < graph.planets.length; planetIdx++) {
    for (const edge of graph.adjacency[planetIdx]!) {
      if (edge.to <= planetIdx) continue;
      const nameA = graph.planets[planetIdx]!;
      const nameB = graph.planets[edge.to]!;
      const [origin, destination] = nameA < nameB ? [nameA, nameB] : [nameB, nameA];
      rows.push({ origin, destination, travelTime: edge.travelTime });
    }
  }
  rows.sort((a, b) => (a.origin !== b.origin ? (a.origin < b.origin ? -1 : 1) : a.destination < b.destination ? -1 : a.destination > b.destination ? 1 : 0));
  return rows;
}

export interface BuildAppOptions {
  readonly falconConfig: FalconConfig;
  readonly graph: Graph;
  /** Absolute path to a built frontend to serve as static files, if present. */
  readonly staticRoot?: string;
  readonly logger?: boolean;
}

async function readEmpirePayload(request: FastifyRequest): Promise<unknown> {
  if (request.isMultipart()) {
    const file = await request.file();
    if (!file) {
      throw new InvalidConfigError("expected a multipart file field containing empire.json");
    }
    const buffer = await file.toBuffer();
    try {
      return JSON.parse(buffer.toString("utf8"));
    } catch (cause) {
      throw new InvalidConfigError(`uploaded file is not valid JSON: ${(cause as Error).message}`);
    }
  }
  return request.body;
}

/** Builds the Fastify app. Odds are computed against the `graph`/`falconConfig` captured at startup. */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { falconConfig, graph, staticRoot, logger = true } = options;
  const app = Fastify({ logger });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  if (staticRoot && existsSync(staticRoot)) {
    await app.register(fastifyStatic, { root: staticRoot });
  }

  /** Liveness probe: no in-repo consumer, but the cheapest thing a healthcheck or orchestrator can hit. */
  app.get("/api/health", () => ({ status: "ok" as const }));

  app.get("/api/universe", (): UniverseResponse => ({
    departure: falconConfig.departure,
    arrival: falconConfig.arrival,
    autonomy: falconConfig.autonomy,
    planets: graph.planets,
    routes: undirectedRoutes(graph),
  }));

  app.post("/api/odds", async (request, reply) => {
    let empirePayload: unknown;
    try {
      empirePayload = await readEmpirePayload(request);
    } catch (cause) {
      if (cause instanceof InvalidConfigError) {
        return reply.code(400).send({ error: cause.message } satisfies ErrorResponse);
      }
      throw cause;
    }

    let empireConfig;
    try {
      empireConfig = parseEmpireConfig(empirePayload);
    } catch (cause) {
      if (cause instanceof InvalidConfigError) {
        return reply.code(400).send({ error: cause.message } satisfies ErrorResponse);
      }
      throw cause;
    }

    const result = computeOdds({
      graph,
      autonomy: falconConfig.autonomy,
      departure: falconConfig.departure,
      arrival: falconConfig.arrival,
      countdown: empireConfig.countdown,
      bountyHunters: empireConfig.bountyHunters,
    });

    return {
      odds: result.odds,
      oddsPercent: Math.round(result.odds * 100),
      reachable: result.reachable,
      minRiskEncounters: result.minRiskEncounters,
      arrivalDay: result.arrivalDay,
      countdown: empireConfig.countdown,
      bountyHunters: dedupeSightings(empireConfig.bountyHunters),
      itinerary: result.itinerary,
    } satisfies OddsResponse;
  });

  return app;
}
