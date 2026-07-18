import { describe, expect, it } from "vitest";
import { hasRole, type SessionUser } from "./authorization";

function makeSessionUser(role: SessionUser["role"]): SessionUser {
  return {
    professionalId: "prof-1",
    clinicId: "clinic-1",
    role,
    name: "Fisio Teste",
    email: "fisio@test.local",
  };
}

describe("hasRole", () => {
  it("retorna false quando sessionUser é null", () => {
    expect(hasRole(null, ["gestora"])).toBe(false);
  });

  it("retorna true quando o papel do usuário está na lista permitida", () => {
    expect(hasRole(makeSessionUser("gestora"), ["gestora"])).toBe(true);
    expect(hasRole(makeSessionUser("fisioterapeuta"), ["fisioterapeuta", "gestora"])).toBe(true);
  });

  it("retorna false quando o papel do usuário não está na lista permitida", () => {
    expect(hasRole(makeSessionUser("fisioterapeuta"), ["gestora"])).toBe(false);
  });

  it("retorna false para lista de papéis permitidos vazia", () => {
    expect(hasRole(makeSessionUser("gestora"), [])).toBe(false);
  });
});
