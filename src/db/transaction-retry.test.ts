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

  it("usa o erro específico de buildConflictError após esgotar as tentativas, em vez de SchedulingConflictError", async () => {
    class CustomWriteConflictError extends Error {
      constructor(public readonly cause: unknown) {
        super("conflito específico");
        this.name = "CustomWriteConflictError";
      }
    }
    const fn = vi.fn().mockRejectedValue(makeWrappedSerializationFailure());
    const buildConflictError = vi.fn((lastError: unknown) => new CustomWriteConflictError(lastError));

    const error = await withSerializableRetry(fn, buildConflictError).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CustomWriteConflictError);
    expect(error).not.toBeInstanceOf(SchedulingConflictError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("passa o último erro de serialization_failure para buildConflictError", async () => {
    const firstFailure = makeWrappedSerializationFailure();
    const secondFailure = makeWrappedSerializationFailure();
    const thirdFailure = makeWrappedSerializationFailure();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(firstFailure)
      .mockRejectedValueOnce(secondFailure)
      .mockRejectedValueOnce(thirdFailure);
    const buildConflictError = vi.fn((lastError: unknown) => new Error("conflito", { cause: lastError }));

    await withSerializableRetry(fn, buildConflictError).catch(() => undefined);

    expect(buildConflictError).toHaveBeenCalledTimes(1);
    expect(buildConflictError).toHaveBeenCalledWith(thirdFailure);
  });

  it("não chama buildConflictError quando fn tem sucesso, mesmo após um retry", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeWrappedSerializationFailure())
      .mockResolvedValueOnce("ok-na-segunda");
    const buildConflictError = vi.fn((lastError: unknown) => new Error("não deveria ser chamado", { cause: lastError }));

    const result = await withSerializableRetry(fn, buildConflictError);

    expect(result).toBe("ok-na-segunda");
    expect(buildConflictError).not.toHaveBeenCalled();
  });

  it("não aplica retry nem chama buildConflictError para um erro que não é serialization_failure", async () => {
    const domainError = new Error("erro de domínio simulado");
    const fn = vi.fn().mockRejectedValue(domainError);
    const buildConflictError = vi.fn((lastError: unknown) => new Error("não deveria ser chamado", { cause: lastError }));

    await expect(withSerializableRetry(fn, buildConflictError)).rejects.toBe(domainError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(buildConflictError).not.toHaveBeenCalled();
  });
});
