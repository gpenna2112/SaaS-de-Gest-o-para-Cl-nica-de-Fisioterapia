import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPatientSchema } from "./patient";

const VALID_PROFESSIONAL_ID = randomUUID();

describe("createPatientSchema", () => {
  it("aceita nome e profissional válidos sem telefone", () => {
    const result = createPatientSchema.safeParse({
      primaryProfessionalId: VALID_PROFESSIONAL_ID,
      name: "Ana",
    });

    expect(result.success).toBe(true);
  });

  it("aceita telefone em formatos comuns (mesma regra de normalizePhone)", () => {
    const result = createPatientSchema.safeParse({
      primaryProfessionalId: VALID_PROFESSIONAL_ID,
      name: "Ana",
      phone: "(11) 98765-4321",
    });

    expect(result.success).toBe(true);
  });

  it("aceita phone null explicitamente", () => {
    const result = createPatientSchema.safeParse({
      primaryProfessionalId: VALID_PROFESSIONAL_ID,
      name: "Ana",
      phone: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejeita nome vazio", () => {
    const result = createPatientSchema.safeParse({
      primaryProfessionalId: VALID_PROFESSIONAL_ID,
      name: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita primaryProfessionalId que não é uuid", () => {
    const result = createPatientSchema.safeParse({
      primaryProfessionalId: "not-a-uuid",
      name: "Ana",
    });

    expect(result.success).toBe(false);
  });

  it("rejeita telefone malformado", () => {
    const result = createPatientSchema.safeParse({
      primaryProfessionalId: VALID_PROFESSIONAL_ID,
      name: "Ana",
      phone: "123",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Telefone inválido.");
  });
});
