import { existsSync } from "node:fs";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import {
  InvalidConfigError,
  computeOdds,
  parseEmpireConfig,
  type FalconConfig,
  type Graph,
} from "@falcon/core";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

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

  app.get("/api/health", async () => ({ status: "ok" as const }));

  app.get("/api/mission", async () => ({
    departure: falconConfig.departure,
    arrival: falconConfig.arrival,
    autonomy: falconConfig.autonomy,
  }));

  app.post("/api/odds", async (request, reply) => {
    let empirePayload: unknown;
    try {
      empirePayload = await readEmpirePayload(request);
    } catch (cause) {
      if (cause instanceof InvalidConfigError) {
        return reply.code(400).send({ error: cause.message });
      }
      throw cause;
    }

    let empireConfig;
    try {
      empireConfig = parseEmpireConfig(empirePayload);
    } catch (cause) {
      if (cause instanceof InvalidConfigError) {
        return reply.code(400).send({ error: cause.message });
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
    };
  });

  return app;
}
