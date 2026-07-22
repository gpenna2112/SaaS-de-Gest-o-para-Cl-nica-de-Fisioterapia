import postgres from "postgres";

const UNIQUE_VIOLATION_CODE = "23505";

/**
 * O driver postgres-js lança PostgresError; o `db.transaction()` do
 * drizzle-orm embrulha isso num DrizzleQueryError, com o PostgresError real
 * em `.cause` — verificar só o erro direto não detecta a violação em todos
 * os casos observados na prática (mesmo padrão já documentado em
 * `transaction-retry.ts` para serialization_failure). Anda até 3 níveis de
 * `.cause` (o suficiente para o wrapping observado, sem recursão ilimitada).
 */
export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (
      current instanceof postgres.PostgresError &&
      current.code === UNIQUE_VIOLATION_CODE &&
      current.constraint_name === constraintName
    ) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
