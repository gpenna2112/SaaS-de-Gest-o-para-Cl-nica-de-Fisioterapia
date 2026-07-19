import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { clinics } from "../schema";
import { createClinicsRepository } from "./clinics-repository";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL (ou DATABASE_URL) não configurada. Testes de integração exigem um Postgres " +
      "real e alcançável, com as migrations já aplicadas. Ver src/db/repositories/README.md.",
  );
}

const db: DbClient = createDbClient(TEST_DATABASE_URL);

describe("ClinicsRepository", () => {
  let clinicId: string;

  beforeEach(async () => {
    const suffix = randomUUID();
    const [clinic] = await db
      .insert(clinics)
      .values({
        name: `Clinics Test Clinic ${suffix}`,
        defaultSessionDurationMinutes: 45,
      })
      .returning();
    clinicId = clinic!.id;
  });

  afterEach(async () => {
    await db.delete(clinics).where(eq(clinics.id, clinicId));
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("retorna a própria clínica", async () => {
    const repo = createClinicsRepository(db, clinicId);
    const clinic = await repo.getClinic();

    expect(clinic?.id).toBe(clinicId);
    expect(clinic?.defaultSessionDurationMinutes).toBe(45);
  });

  it("retorna null para um clinicId inexistente", async () => {
    const repo = createClinicsRepository(db, randomUUID());
    const clinic = await repo.getClinic();

    expect(clinic).toBeNull();
  });
});
