import { drizzle } from "drizzle-orm/postgres-js";
import type { PgTransaction } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export function createDbClient(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;

/**
 * Transação já aberta, compartilhável entre repositórios de módulos
 * diferentes (ex.: scheduling + notifications) para composição atômica.
 * Tipo compartilhado para que um repositório não precise importar de outro
 * só para referenciar esse tipo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = PgTransaction<any, any, any>;

/** DbClient ou uma Tx já aberta — para operações que funcionam sob qualquer um dos dois. */
export type QueryExecutor = DbClient | Tx;
