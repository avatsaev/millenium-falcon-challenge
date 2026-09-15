#!/usr/bin/env node
import { computeOddsPercent } from "./run.js";

async function main(): Promise<void> {
  const [falconConfigPath, empireConfigPath] = process.argv.slice(2);
  if (!falconConfigPath || !empireConfigPath) {
    console.error("Usage: give-me-the-odds <millennium-falcon.json> <empire.json>");
    process.exitCode = 1;
    return;
  }

  try {
    const oddsPercent = await computeOddsPercent(falconConfigPath, empireConfigPath);
    console.log(oddsPercent);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
