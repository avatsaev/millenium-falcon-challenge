import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node24",
  platform: "node",
  sourcemap: true,
  clean: true,
  external: ["better-sqlite3"],
});
