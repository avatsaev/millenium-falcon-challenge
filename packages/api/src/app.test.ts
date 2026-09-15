import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, loadEmpireConfig, loadFalconConfig, loadRoutes, type FalconConfig, type Graph } from "@falcon/core";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "..", "..", "examples");

async function loadFixture(name: string): Promise<{ falconConfig: FalconConfig; graph: Graph }> {
  const falconConfig = await loadFalconConfig(join(examplesDir, name, "millennium-falcon.json"));
  const routes = loadRoutes(falconConfig.routesDb);
  const graph = buildGraph(routes, [falconConfig.departure, falconConfig.arrival]);
  return { falconConfig, graph };
}

describe("app", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("GET /api/mission returns the falcon's departure/arrival/autonomy", async () => {
    const { falconConfig, graph } = await loadFixture("example2");
    app = await buildApp({ falconConfig, graph, logger: false });

    const response = await app.inject({ method: "GET", url: "/api/mission" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      departure: "Tatooine",
      arrival: "Endor",
      autonomy: 6,
    });
  });

  it("POST /api/odds computes odds from a JSON body, matching example2/answer.json", async () => {
    const { falconConfig, graph } = await loadFixture("example2");
    app = await buildApp({ falconConfig, graph, logger: false });
    const empireConfig = await loadEmpireConfig(join(examplesDir, "example2", "empire.json"));

    const response = await app.inject({
      method: "POST",
      url: "/api/odds",
      payload: { countdown: empireConfig.countdown, bounty_hunters: empireConfig.bountyHunters },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.oddsPercent).toBe(81);
    expect(body.reachable).toBe(true);
    expect(body.odds).toBeCloseTo(0.81, 9);
  });

  it("POST /api/odds returns 0% when the destination is unreachable in time (example1)", async () => {
    const { falconConfig, graph } = await loadFixture("example1");
    app = await buildApp({ falconConfig, graph, logger: false });
    const empireConfig = await loadEmpireConfig(join(examplesDir, "example1", "empire.json"));

    const response = await app.inject({
      method: "POST",
      url: "/api/odds",
      payload: { countdown: empireConfig.countdown, bounty_hunters: empireConfig.bountyHunters },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.oddsPercent).toBe(0);
    expect(body.reachable).toBe(false);
  });

  it("POST /api/odds returns 400 for a malformed empire.json payload", async () => {
    const { falconConfig, graph } = await loadFixture("example2");
    app = await buildApp({ falconConfig, graph, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/api/odds",
      payload: { countdown: "not-a-number" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/countdown/);
  });
});
