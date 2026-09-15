import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { InvalidConfigError } from "./errors.js";
import { loadRoutes } from "./routes-db.js";

let dir: string | undefined;

/** Builds a throwaway SQLite database from raw DDL/DML and returns its path. */
function createDb(sql: string): string {
  dir = mkdtempSync(join(tmpdir(), "falcon-routes-db-test-"));
  const dbPath = join(dir, "universe.db");
  const db = new Database(dbPath);
  db.exec(sql);
  db.close();
  return dbPath;
}

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe("loadRoutes", () => {
  it("reads a table declared with lowercase columns", () => {
    const dbPath = createDb(
      "CREATE TABLE routes (origin TEXT, destination TEXT, travel_time INTEGER); " +
        "INSERT INTO routes VALUES ('Tatooine', 'Dagobah', 6);",
    );
    expect(loadRoutes(dbPath)).toEqual([{ origin: "Tatooine", destination: "Dagobah", travelTime: 6 }]);
  });

  it("reads a table declared with the README's uppercase schema (ROUTES, ORIGIN, DESTINATION, TRAVEL_TIME)", () => {
    const dbPath = createDb(
      "CREATE TABLE ROUTES (ORIGIN TEXT, DESTINATION TEXT, TRAVEL_TIME INTEGER); " +
        "INSERT INTO ROUTES VALUES ('Tatooine', 'Dagobah', 6);",
    );
    expect(loadRoutes(dbPath)).toEqual([{ origin: "Tatooine", destination: "Dagobah", travelTime: 6 }]);
  });

  it("rejects a non-positive travel_time", () => {
    const dbPath = createDb(
      "CREATE TABLE routes (origin TEXT, destination TEXT, travel_time INTEGER); " +
        "INSERT INTO routes VALUES ('Tatooine', 'Dagobah', 0);",
    );
    expect(() => loadRoutes(dbPath)).toThrow(InvalidConfigError);
  });

  it("rejects a database that does not exist", () => {
    expect(() => loadRoutes(join(tmpdir(), "does-not-exist.db"))).toThrow(InvalidConfigError);
  });
});
