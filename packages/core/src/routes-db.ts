import Database from "better-sqlite3";
import { InvalidConfigError } from "./errors.js";
import type { Route } from "./types.js";

interface RouteRow {
  origin: unknown;
  destination: unknown;
  travel_time: unknown;
}

/**
 * Loads the routes table from the SQLite database at `dbPath`. SQLite identifiers are
 * case-insensitive, so this reads the `routes`/`ROUTES` table regardless of casing.
 */
export function loadRoutes(dbPath: string): Route[] {
  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (cause) {
    throw new InvalidConfigError(`could not open routes database at "${dbPath}": ${(cause as Error).message}`);
  }

  try {
    const rows = db.prepare("SELECT origin, destination, travel_time FROM routes").all() as RouteRow[];
    return rows.map((row, index) => {
      if (typeof row.origin !== "string" || row.origin.length === 0) {
        throw new InvalidConfigError(`routes[${index}].origin must be a non-empty string`);
      }
      if (typeof row.destination !== "string" || row.destination.length === 0) {
        throw new InvalidConfigError(`routes[${index}].destination must be a non-empty string`);
      }
      if (typeof row.travel_time !== "number" || !Number.isInteger(row.travel_time) || row.travel_time <= 0) {
        throw new InvalidConfigError(`routes[${index}].travel_time must be a strictly positive integer`);
      }
      return { origin: row.origin, destination: row.destination, travelTime: row.travel_time };
    });
  } finally {
    db.close();
  }
}
