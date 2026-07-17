import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("normaliza número com DDD e 9º dígito, sem formatação", () => {
    expect(normalizePhone("11999998888")).toBe("+5511999998888");
  });

  it("normaliza número formatado com parênteses, espaço e traço", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("+5511999998888");
  });

  it("normaliza número já com DDI +55 e formatação", () => {
    expect(normalizePhone("+55 11 99999-8888")).toBe("+5511999998888");
  });

  it("normaliza número já com DDI 55 sem o +", () => {
    expect(normalizePhone("5511999998888")).toBe("+5511999998888");
  });

  it("normaliza número fixo (10 dígitos, sem 9º dígito)", () => {
    expect(normalizePhone("1133334444")).toBe("+551133334444");
  });

  it("rejeita entrada curta demais", () => {
    expect(normalizePhone("12345")).toBeNull();
  });

  it("rejeita entrada sem nenhum dígito", () => {
    expect(normalizePhone("abc")).toBeNull();
  });

  it("rejeita DDD fora da faixa válida (abaixo de 11)", () => {
    expect(normalizePhone("0599998888")).toBeNull();
  });
});

describe("isValidPhone", () => {
  it("reflete normalizePhone", () => {
    expect(isValidPhone("11999998888")).toBe(true);
    expect(isValidPhone("abc")).toBe(false);
  });
});
