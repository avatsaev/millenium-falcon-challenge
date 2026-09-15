// Flat ESLint config for the whole workspace: one config, one process, run from the repo root.
//
// Type-aware by default (`recommendedTypeChecked` + the project service), because the rules worth having
// here - floating promises, misused promises, unsafe `any` flow, exhaustive switches - cannot be decided
// from syntax alone. Formatting is deliberately absent: no stylistic rules, no Prettier, nothing that
// argues about where a brace goes.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/** Package boundaries, as documented in `swe/specs/architecture/monorepo-tooling.md`. */
const restrictedImports = {
  patterns: [
    {
      group: ["../../*"],
      message:
        "Relative imports must not cross a package boundary. Import the workspace package by name (`@falcon/core`).",
    },
    {
      group: ["@falcon/*/src/*", "@falcon/*/dist/*"],
      message: "Import a workspace package's public entry point, never a file inside it.",
    },
  ],
};

export default defineConfig(
  globalIgnores(["**/dist/**", "**/coverage/**"]),

  // Every TypeScript file in the workspace.
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Unused code is dead weight; `_`-prefixed names are the documented opt-out.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // One way to write each of these.
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
      "object-shorthand": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // Correctness the compiler does not cover.
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "no-restricted-imports": ["error", restrictedImports],
    },
  },

  // Node packages: `console` is their output device (the CLI prints the odds, the server logs).
  {
    files: ["packages/{core,api,cli}/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // C3PO: browser globals, React hook rules, and no `console` - the page is the output device.
  {
    files: ["packages/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
    languageOptions: { globals: globals.browser },
    rules: {
      "no-console": "error",
      // A stale dependency array is a bug, not a style opinion.
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // Build/test config files live outside every `tsconfig.json`'s `include`, so they get no type-aware
  // rules - there is no program to ask.
  {
    files: ["**/*.config.{ts,mts,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);
