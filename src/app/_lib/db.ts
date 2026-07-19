import { createDbClient, type DbClient } from "@/db/client";
import { getEnv } from "@/lib/env";

let db: DbClient | undefined;

export function getDb(): DbClient {
  db ??= createDbClient(getEnv().DATABASE_URL);
  return db;
}
