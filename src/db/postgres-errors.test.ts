import { PostgresError } from "postgres";
import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./postgres-errors";

const CONSTRAINT = "professionals_clinic_email_unique";

// O .d.ts do pacote `postgres` herda a assinatura de Error (message?: string),
// mas o construtor real espera um objeto de detalhes (Object.assign(this, x))
// — daqui vem o cast abaixo (mesmo padrão de transaction-retry.test.ts).
function makeUniqueViolation(constraintName: string): PostgresError {
  return new PostgresError({
    message: "duplicate key value violates unique constraint",
    code: "23505",
    constraint_name: constraintName,
  } as never);
}

describe("isUniqueViolation", () => {
  it("reconhece 23505 direto com o nome exato da constraint", () => {
    const error = makeUniqueViolation(CONSTRAINT);
    expect(isUniqueViolation(error, CONSTRAINT)).toBe(true);
  });

  it("reconhece 23505 embrulhado em .cause — mesmo padrão de wrapping do drizzle-orm", () => {
    const wrapped = new Error("Failed query: insert into ...", { cause: makeUniqueViolation(CONSTRAINT) });
    expect(isUniqueViolation(wrapped, CONSTRAINT)).toBe(true);
  });

  it("rejeita um código diferente de 23505", () => {
    const otherCodeError = new PostgresError({
      message: "could not serialize access",
      code: "40001",
      constraint_name: CONSTRAINT,
    } as never);
    expect(isUniqueViolation(otherCodeError, CONSTRAINT)).toBe(false);
  });

  it("rejeita quando o nome da constraint não bate", () => {
    const error = makeUniqueViolation("rooms_clinic_name_unique");
    expect(isUniqueViolation(error, CONSTRAINT)).toBe(false);
  });

  it("não lança para valores desconhecidos — string, número, objeto plano", () => {
    expect(() => isUniqueViolation("erro qualquer", CONSTRAINT)).not.toThrow();
    expect(isUniqueViolation("erro qualquer", CONSTRAINT)).toBe(false);
    expect(isUniqueViolation(42, CONSTRAINT)).toBe(false);
    expect(isUniqueViolation({ code: "23505", constraint_name: CONSTRAINT }, CONSTRAINT)).toBe(false);
  });

  it("não lança para null/undefined", () => {
    expect(() => isUniqueViolation(null, CONSTRAINT)).not.toThrow();
    expect(isUniqueViolation(null, CONSTRAINT)).toBe(false);
    expect(isUniqueViolation(undefined, CONSTRAINT)).toBe(false);
  });

  it("não lança para um Error comum sem .cause", () => {
    const plainError = new Error("erro de domínio qualquer");
    expect(() => isUniqueViolation(plainError, CONSTRAINT)).not.toThrow();
    expect(isUniqueViolation(plainError, CONSTRAINT)).toBe(false);
  });

  it("respeita o limite documentado de 3 níveis — detecta a violação embrulhada 2 níveis de profundidade", () => {
    const wrappedTwice = new Error("nível 1", {
      cause: new Error("nível 2", { cause: makeUniqueViolation(CONSTRAINT) }),
    });
    expect(isUniqueViolation(wrappedTwice, CONSTRAINT)).toBe(true);
  });

  it("respeita o limite documentado de 3 níveis — NÃO detecta além do limite (4º nível)", () => {
    const wrappedThreeTimes = new Error("nível 1", {
      cause: new Error("nível 2", {
        cause: new Error("nível 3", { cause: makeUniqueViolation(CONSTRAINT) }),
      }),
    });
    expect(isUniqueViolation(wrappedThreeTimes, CONSTRAINT)).toBe(false);
  });
});
