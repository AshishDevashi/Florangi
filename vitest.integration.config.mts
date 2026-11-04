import path from "node:path";
import { defineConfig } from "vitest/config";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("Set TEST_DATABASE_URL to a disposable migrated PostgreSQL database before running integration tests.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.SESSION_SECRET ??= "integration-test-session-secret-not-for-production";
process.env.EMAIL_DRIVER = "dev";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "server-only": path.resolve(process.cwd(), "src/test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});