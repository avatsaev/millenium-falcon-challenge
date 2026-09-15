import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node24",
  platform: "node",
  sourcemap: true,
  clean: true,
  external: ["better-sqlite3"],
});
