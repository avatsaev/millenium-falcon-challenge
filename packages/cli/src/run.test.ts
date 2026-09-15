import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { computeOddsPercent } from "./run.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "..", "..", "examples");

/** The graded expectation for a fixture: `answer.json`'s odds as the integer percentage the CLI prints. */
async function expectedPercent(name: string): Promise<number> {
  const raw = await readFile(join(examplesDir, name, "answer.json"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  const odds = (parsed as { odds?: unknown } | null)?.odds;
  if (typeof odds !== "number") {
    throw new Error(`answer.json for ${name} must be an object with a numeric "odds" field`);
  }
  return Math.round(odds * 100);
}

describe("computeOddsPercent against the README examples", () => {
  for (const name of ["example1", "example2", "example3", "example4"]) {
    it(`matches ${name}/answer.json`, async () => {
      const dir = join(examplesDir, name);
      const actual = await computeOddsPercent(join(dir, "millennium-falcon.json"), join(dir, "empire.json"));
      expect(actual).toBe(await expectedPercent(name));
    });
  }
});
