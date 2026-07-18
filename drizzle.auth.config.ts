import { defineConfig } from "drizzle-kit";

/**
 * Config separada para as tabelas do Better Auth (user/session/account/
 * verification) — schema gerado pela própria CLI do Better Auth
 * (src/modules/auth/better-auth-schema.ts, ver README de modules/auth),
 * histórico de migrations independente do nosso domínio (ADR-0017: dois
 * sistemas de migração deliberadamente não acoplados, mesma ferramenta).
 */
export default defineConfig({
  schema: "./src/modules/auth/better-auth-schema.ts",
  out: "./src/modules/auth/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://user:password@localhost:5432/clinic_management",
  },
  // Rastreamento de migrations isolado do nosso (drizzle.config.ts usa o
  // default: schema "drizzle", tabela "__drizzle_migrations") — sem isso os
  // dois históricos ficariam registrados na mesma tabela por padrão.
  migrations: {
    schema: "drizzle_auth",
    table: "__drizzle_migrations_auth",
  },
});
