import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  // Assina/criptografa sessões e tokens do Better Auth (ADR-0006/0017).
  BETTER_AUTH_SECRET: z.string().min(32),
  // URL base da aplicação — usada pelo Better Auth para montar links/cookies.
  BETTER_AUTH_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, string | undefined>): Env {
  return envSchema.parse(input);
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
