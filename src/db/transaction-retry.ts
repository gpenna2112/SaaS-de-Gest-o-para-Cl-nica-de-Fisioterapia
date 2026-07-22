import postgres from "postgres";
import { SchedulingConflictError } from "./repositories/scheduling-repository.errors";

const { PostgresError } = postgres;

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 20;

const SERIALIZATION_FAILURE_CODE = "40001";

/**
 * O driver postgres-js lança PostgresError; o `db.transaction()` do
 * drizzle-orm embrulha isso num DrizzleQueryError, com o PostgresError real
 * em `.cause` — verificar só o erro direto nunca detecta 40001 na prática.
 * Anda até 3 níveis de `.cause` (o suficiente para o wrapping observado, sem
 * recursão ilimitada).
 */
function isSerializationFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (current instanceof PostgresError && current.code === SERIALIZATION_FAILURE_CODE) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

function backoffMs(attempt: number): number {
  const jitter = Math.random() * BASE_BACKOFF_MS;
  return BASE_BACKOFF_MS * attempt + jitter;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa `fn` (que deve abrir sua própria transação SERIALIZABLE) e tenta
 * novamente, com um backoff curto, apenas quando o Postgres reporta
 * serialization_failure (SQLSTATE 40001). Qualquer outro erro — incluindo
 * erros de domínio como RoomAtCapacityError — propaga imediatamente, sem
 * retry: só uma corrida transitória de concorrência justifica tentar de novo.
 *
 * Limite pequeno e explícito de tentativas (MAX_ATTEMPTS); esgotado, lança o
 * erro de conflito do chamador (`buildConflictError`, default
 * `SchedulingConflictError` — mantém o comportamento histórico de agenda) —
 * nunca retry infinito. Repositórios fora de `scheduling` (ex.:
 * `professionals-repository.ts`) devem passar seu próprio erro de domínio
 * em vez de deixar um `SchedulingConflictError` de agenda vazar para uma
 * operação que não tem nada a ver com sessões.
 */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  buildConflictError: (lastError: unknown) => Error = (lastError) => new SchedulingConflictError(lastError),
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isSerializationFailure(error)) {
        throw error;
      }
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await delay(backoffMs(attempt));
      }
    }
  }

  throw buildConflictError(lastError);
}
