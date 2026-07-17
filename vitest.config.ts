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
    include: ["src/**/*.test.ts"],
    // Testes de integração exigem Postgres real e rodam separadamente
    // (npm run test:integration, vitest.integration.config.ts).
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
});
