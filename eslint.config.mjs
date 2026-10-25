import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Separately packaged Cloudflare Worker (own package.json and tooling).
    "deploy/**",
    "frontend/app/**",
    "frontend/components/**",
    "frontend/lib/**",
    "frontend/public/**",
    "frontend/.next/**",
    // Local Claude Code state, including agent worktrees (full repo copies).
    ".claude/**",
    // esbuild bundles of the worker and beat (scripts/build-jobs.mjs).
    "dist/**",
  ]),
  // Owner rule: no source file over 300 lines (tests/unit/file-length.test.ts checks CSS and shell too).
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    ignores: ["lib/frontend/registry.ts"],
    rules: { "max-lines": ["error", { max: 300 }] },
  },
]);

export default eslintConfig;
