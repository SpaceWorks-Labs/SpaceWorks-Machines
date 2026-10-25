import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
      "server-only": `${rootDir}tests/helpers/server-only.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Hermetic base URL, whatever a developer's shell or .env sets.
    // Hermetic: no breached-password lookups over the network (tests/unit/login-protections.test.ts turns it on).
    env: { NEXT_PUBLIC_BASE_URL: "http://localhost:3000", PWNED_PASSWORDS_CHECK: "0" },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/actions/**/*.ts"],
      exclude: ["**/*.client.ts"],
    },
  },
});
