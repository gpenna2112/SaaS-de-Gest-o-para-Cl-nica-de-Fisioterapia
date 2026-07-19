import { eq } from "drizzle-orm";
import type { DbClient, Tx } from "../client";
import { clinics } from "../schema";

export type Clinic = typeof clinics.$inferSelect;

/** Tenant-scoped, só leitura — a própria clínica identificada pela fábrica. */
export interface ClinicsRepository {
  getClinic(tx?: Tx): Promise<Clinic | null>;
}

export function createClinicsRepository(
  db: DbClient,
  clinicId: string,
): ClinicsRepository {
  return {
    async getClinic(tx) {
      const executor = tx ?? db;
      const [clinic] = await executor
        .select()
        .from(clinics)
        .where(eq(clinics.id, clinicId));
      return clinic ?? null;
    },
  };
}
