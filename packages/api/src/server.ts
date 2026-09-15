import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, loadFalconConfig, loadRoutes } from "@falcon/core";
import { buildApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const falconConfigPath = resolve(process.env["FALCON_CONFIG_PATH"] ?? "millennium-falcon.json");
  const port = Number(process.env["PORT"] ?? 4000);
  const host = process.env["HOST"] ?? "0.0.0.0";

  const falconConfig = await loadFalconConfig(falconConfigPath);
  const routes = loadRoutes(falconConfig.routesDb);
  const graph = buildGraph(routes, [falconConfig.departure, falconConfig.arrival]);

  // `src` and `dist` are both direct children of packages/api, and the built frontend lives at
  // packages/web/dist, so this relative path resolves correctly whether running from source or dist.
  const staticRoot = resolve(here, "../../web/dist");

  const app = await buildApp({ falconConfig, graph, staticRoot });

  await app.listen({ port, host });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
