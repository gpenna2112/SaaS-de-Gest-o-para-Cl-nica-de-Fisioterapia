import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("aceita um ambiente válido e aplica o default de NODE_ENV", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://user:pass@localhost:5432/clinic_management",
    });

    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/clinic_management");
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejeita quando DATABASE_URL está ausente", () => {
    expect(() => parseEnv({})).toThrow();
  });

  it("rejeita quando DATABASE_URL não é uma URL válida", () => {
    expect(() => parseEnv({ DATABASE_URL: "nao-e-uma-url" })).toThrow();
  });

  it("rejeita um NODE_ENV fora do enum permitido", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/clinic_management",
        NODE_ENV: "staging",
      }),
    ).toThrow();
  });
});
