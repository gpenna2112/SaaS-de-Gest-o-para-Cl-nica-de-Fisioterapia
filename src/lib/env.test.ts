import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const validBaseEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/clinic_management",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

function withoutKey(key: keyof typeof validBaseEnv): Record<string, string> {
  const copy = { ...validBaseEnv };
  delete copy[key];
  return copy;
}

describe("parseEnv", () => {
  it("aceita um ambiente válido e aplica o default de NODE_ENV", () => {
    const env = parseEnv(validBaseEnv);

    expect(env.DATABASE_URL).toBe(validBaseEnv.DATABASE_URL);
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejeita quando DATABASE_URL está ausente", () => {
    expect(() => parseEnv(withoutKey("DATABASE_URL"))).toThrow();
  });

  it("rejeita quando DATABASE_URL não é uma URL válida", () => {
    expect(() => parseEnv({ ...validBaseEnv, DATABASE_URL: "nao-e-uma-url" })).toThrow();
  });

  it("rejeita um NODE_ENV fora do enum permitido", () => {
    expect(() => parseEnv({ ...validBaseEnv, NODE_ENV: "staging" })).toThrow();
  });

  it("rejeita quando BETTER_AUTH_SECRET está ausente ou curto demais", () => {
    expect(() => parseEnv(withoutKey("BETTER_AUTH_SECRET"))).toThrow();
    expect(() => parseEnv({ ...validBaseEnv, BETTER_AUTH_SECRET: "curto" })).toThrow();
  });

  it("rejeita quando BETTER_AUTH_URL não é uma URL válida", () => {
    expect(() => parseEnv({ ...validBaseEnv, BETTER_AUTH_URL: "nao-e-uma-url" })).toThrow();
  });
});
