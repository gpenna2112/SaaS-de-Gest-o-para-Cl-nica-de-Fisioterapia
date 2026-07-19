import { and, eq } from "drizzle-orm";
import type { DbClient, Tx } from "../client";
import { professionals } from "../schema";

export type Professional = typeof professionals.$inferSelect;

export interface ListProfessionalsFilter {
  activeOnly?: boolean;
}

/**
 * Tenant-scoped, só leitura (ADR-0007) — diferente de
 * `professionals-auth-repository.ts`, que resolve identidade antes de a
 * clínica ser conhecida e por isso não tem `clinicId` na fábrica.
 */
export interface ProfessionalsRepository {
  listProfessionals(
    filter: ListProfessionalsFilter,
    tx?: Tx,
  ): Promise<Professional[]>;
}

export function createProfessionalsRepository(
  db: DbClient,
  clinicId: string,
): ProfessionalsRepository {
  return {
    listProfessionals(filter, tx) {
      const executor = tx ?? db;
      const conditions = [eq(professionals.clinicId, clinicId)];
      if (filter.activeOnly) {
        conditions.push(eq(professionals.active, true));
      }
      return executor
        .select()
        .from(professionals)
        .where(and(...conditions));
    },
  };
}
