import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { InvalidConfigError } from "./errors.js";
import { isRecord } from "./guards.js";
import type { BountyHunterSighting, EmpireConfig, FalconConfig } from "./types.js";

async function readJson(path: string, describe: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (cause) {
    throw new InvalidConfigError(`could not read ${describe} at "${path}": ${(cause as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new InvalidConfigError(`${describe} at "${path}" is not valid JSON: ${(cause as Error).message}`);
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidConfigError(`"${field}" must be a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new InvalidConfigError(`"${field}" must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Loads and validates millennium-falcon.json, resolving `routes_db` relative to its directory. */
export async function loadFalconConfig(path: string): Promise<FalconConfig> {
  const data = await readJson(path, "millennium-falcon.json");
  if (!isRecord(data)) {
    throw new InvalidConfigError(`millennium-falcon.json at "${path}" must be a JSON object`);
  }

  const autonomy = requireNonNegativeInt(data["autonomy"], "autonomy");
  const departure = requireNonEmptyString(data["departure"], "departure");
  const arrival = requireNonEmptyString(data["arrival"], "arrival");
  const routesDbField = requireNonEmptyString(data["routes_db"], "routes_db");
  const routesDb = isAbsolute(routesDbField) ? routesDbField : resolve(dirname(path), routesDbField);

  return { autonomy, departure, arrival, routesDb };
}

function parseBountyHunterSighting(value: unknown, index: number): BountyHunterSighting {
  if (!isRecord(value)) {
    throw new InvalidConfigError(`bounty_hunters[${index}] must be a JSON object`);
  }
  const planet = requireNonEmptyString(value["planet"], `bounty_hunters[${index}].planet`);
  const day = requireNonNegativeInt(value["day"], `bounty_hunters[${index}].day`);
  return { planet, day };
}

/** Loads and validates empire.json. */
export async function loadEmpireConfig(path: string): Promise<EmpireConfig> {
  const data = await readJson(path, "empire.json");
  if (!isRecord(data)) {
    throw new InvalidConfigError(`empire.json at "${path}" must be a JSON object`);
  }

  const countdown = requireNonNegativeInt(data["countdown"], "countdown");
  const bountyHuntersRaw = data["bounty_hunters"] ?? [];
  if (!Array.isArray(bountyHuntersRaw)) {
    throw new InvalidConfigError(`"bounty_hunters" must be an array, got ${JSON.stringify(bountyHuntersRaw)}`);
  }
  const bountyHunters = bountyHuntersRaw.map(parseBountyHunterSighting);

  return { countdown, bountyHunters };
}

/** Parses and validates an already-loaded empire.json payload (e.g. from an HTTP upload). */
export function parseEmpireConfig(data: unknown): EmpireConfig {
  if (!isRecord(data)) {
    throw new InvalidConfigError("empire.json payload must be a JSON object");
  }
  const countdown = requireNonNegativeInt(data["countdown"], "countdown");
  const bountyHuntersRaw = data["bounty_hunters"] ?? [];
  if (!Array.isArray(bountyHuntersRaw)) {
    throw new InvalidConfigError(`"bounty_hunters" must be an array, got ${JSON.stringify(bountyHuntersRaw)}`);
  }
  const bountyHunters = bountyHuntersRaw.map(parseBountyHunterSighting);
  return { countdown, bountyHunters };
}
