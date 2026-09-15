import { readFile } from "node:fs/promises";
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

  it("GET /api/universe returns the fixture's planets, routes and startup mission fields", async () => {
    const { falconConfig, graph } = await loadFixture("example2");
    app = await buildApp({ falconConfig, graph, logger: false });

    const response = await app.inject({ method: "GET", url: "/api/universe" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.departure).toBe("Tatooine");
    expect(body.arrival).toBe("Endor");
    expect(body.autonomy).toBe(6);
    expect(body.planets.sort()).toEqual(["Dagobah", "Endor", "Hoth", "Tatooine"]);
    expect(body.routes).toEqual([
      { origin: "Dagobah", destination: "Endor", travelTime: 4 },
      { origin: "Dagobah", destination: "Hoth", travelTime: 1 },
      { origin: "Dagobah", destination: "Tatooine", travelTime: 6 },
      { origin: "Endor", destination: "Hoth", travelTime: 1 },
      { origin: "Hoth", destination: "Tatooine", travelTime: 6 },
    ]);

    const again = await app.inject({ method: "GET", url: "/api/universe" });
    expect(again.json().routes).toEqual(body.routes);
  });

  it("GET /api/mission is gone -- no alias or redirect", async () => {
    const { falconConfig, graph } = await loadFixture("example2");
    app = await buildApp({ falconConfig, graph, logger: false });

    const response = await app.inject({ method: "GET", url: "/api/mission" });

    expect(response.statusCode).toBe(404);
  });

  it("GET /api/health reports liveness", async () => {
    const { falconConfig, graph } = await loadFixture("example2");
    app = await buildApp({ falconConfig, graph, logger: false });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
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
    expect(body.arrivalDay).toBe(8);
    expect(body.countdown).toBe(8);
    expect(body.itinerary).toHaveLength(4);
    expect(body.bountyHunters).toEqual([
      { planet: "Hoth", day: 6 },
      { planet: "Hoth", day: 7 },
      { planet: "Hoth", day: 8 },
    ]);
  });

  it("POST /api/odds accepts a real multipart upload, matching example3/answer.json", async () => {
    const { falconConfig, graph } = await loadFixture("example3");
    app = await buildApp({ falconConfig, graph, logger: false });

    const boundary = "----falcon-test-boundary";
    const empireJson = await readFile(join(examplesDir, "example3", "empire.json"), "utf8");
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="empire.json"',
      "Content-Type: application/json",
      "",
      empireJson,
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/odds",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.oddsPercent).toBe(90);
    expect(body.arrivalDay).toBe(9);
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
    expect(body.arrivalDay).toBeNull();
    expect(body.itinerary).toBeNull();
    expect(body.countdown).toBe(7);
    expect(body.bountyHunters).toEqual([
      { planet: "Hoth", day: 6 },
      { planet: "Hoth", day: 7 },
      { planet: "Hoth", day: 8 },
    ]);
  });

  it("collapses duplicate {planet, day} sightings in the echoed bountyHunters", async () => {
    const { falconConfig, graph } = await loadFixture("example2");
    app = await buildApp({ falconConfig, graph, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/api/odds",
      payload: {
        countdown: 8,
        bounty_hunters: [
          { planet: "Hoth", day: 6 },
          { planet: "Hoth", day: 6 },
          { planet: "Hoth", day: 7 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().bountyHunters).toEqual([
      { planet: "Hoth", day: 6 },
      { planet: "Hoth", day: 7 },
    ]);
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
