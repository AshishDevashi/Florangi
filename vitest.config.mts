import path from "node:path";
import { defineConfig } from "vitest/config";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/florangi_test";
process.env.SESSION_SECRET ??= "vitest-session-secret-never-used-outside-tests";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "server-only": path.resolve(process.cwd(), "src/test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/*.integration.test.ts", "tests/e2e/**", "**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});