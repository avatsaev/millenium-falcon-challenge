import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeOddsPercent } from "./run.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, "..", "..", "..", "examples");

describe("computeOddsPercent against the README examples", () => {
  const expectedByExample: Record<string, number> = {
    example1: 0,
    example2: 81,
    example3: 90,
    example4: 100,
  };

  for (const [name, expected] of Object.entries(expectedByExample)) {
    it(`prints ${expected} for ${name}`, async () => {
      const dir = join(examplesDir, name);
      const actual = await computeOddsPercent(join(dir, "millennium-falcon.json"), join(dir, "empire.json"));
      expect(actual).toBe(expected);
    });
  }
});
