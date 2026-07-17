import { PostgresError } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { SchedulingConflictError } from "./repositories/scheduling-repository.errors";
import { withSerializableRetry } from "./transaction-retry";

// O .d.ts do pacote `postgres` herda a assinatura de Error (message?: string),
// mas o construtor real espera um objeto de detalhes (Object.assign(this, x))
// — daqui vem o cast abaixo.
function makePostgresSerializationFailure(): PostgresError {
  return new PostgresError({
    message: "could not serialize access due to concurrent update",
    code: "40001",
  } as never);
}

/**
 * O drizzle-orm (db.transaction) embrulha o PostgresError real num erro
 * próprio (DrizzleQueryError), expondo o original em `.cause` — é assim que
 * o erro chega de verdade em withSerializableRetry. Um teste que só usasse
 * PostgresError "cru" (sem wrapping) não teria pego o bug real encontrado em
 * produção: isSerializationFailure checando só o erro direto nunca detectava
 * 40001, porque na prática ele sempre vem embrulhado.
 */
function makeWrappedSerializationFailure(): Error {
  return new Error("Failed query: insert into ...", { cause: makePostgresSerializationFailure() });
}

describe("withSerializableRetry", () => {
  it("retorna o resultado direto quando fn resolve na primeira tentativa", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withSerializableRetry(fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("tenta de novo quando o erro embrulhado (.cause) é serialization_failure — caso real do drizzle-orm", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeWrappedSerializationFailure())
      .mockResolvedValueOnce("ok-na-segunda");

    const result = await withSerializableRetry(fn);

    expect(result).toBe("ok-na-segunda");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("também tenta de novo quando o PostgresError chega sem wrapping", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makePostgresSerializationFailure())
      .mockResolvedValueOnce("ok-na-segunda");

    const result = await withSerializableRetry(fn);

    expect(result).toBe("ok-na-segunda");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("desiste após o limite de tentativas e lança SchedulingConflictError, nunca retry infinito", async () => {
    const fn = vi.fn().mockRejectedValue(makeWrappedSerializationFailure());

    await expect(withSerializableRetry(fn)).rejects.toBeInstanceOf(SchedulingConflictError);
    // limite pequeno e explícito: 3 tentativas, não mais que isso.
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("não esconde erros que não são serialization_failure — propaga na primeira tentativa, sem retry", async () => {
    const domainError = new Error("RoomAtCapacityError simulado");
    const fn = vi.fn().mockRejectedValue(domainError);

    await expect(withSerializableRetry(fn)).rejects.toBe(domainError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("não esconde um erro embrulhado cuja causa não é serialization_failure", async () => {
    const wrappedDomainError = new Error("Failed query: insert into ...", {
      cause: new PostgresError({ message: "unique_violation", code: "23505" } as never),
    });
    const fn = vi.fn().mockRejectedValue(wrappedDomainError);

    await expect(withSerializableRetry(fn)).rejects.toBe(wrappedDomainError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
