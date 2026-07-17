import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Transações reais + retries com backoff — mais lento que testes de função pura.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
