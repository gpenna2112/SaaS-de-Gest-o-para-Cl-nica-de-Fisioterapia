import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { clinics, professionals } from "../schema";
import { createProfessionalsRepository } from "./professionals-repository";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL (ou DATABASE_URL) não configurada. Testes de integração exigem um Postgres " +
      "real e alcançável, com as migrations já aplicadas. Ver src/db/repositories/README.md.",
  );
}

const db: DbClient = createDbClient(TEST_DATABASE_URL);

interface Fixture {
  clinicId: string;
  otherClinicId: string;
}

async function setupFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const [clinic] = await db
    .insert(clinics)
    .values({ name: `Professionals Test Clinic ${suffix}` })
    .returning();
  const [otherClinic] = await db
    .insert(clinics)
    .values({ name: `Professionals Other Clinic ${suffix}` })
    .returning();
  return { clinicId: clinic!.id, otherClinicId: otherClinic!.id };
}

async function cleanupClinic(clinicId: string): Promise<void> {
  await db.delete(professionals).where(eq(professionals.clinicId, clinicId));
  await db.delete(clinics).where(eq(clinics.id, clinicId));
}

describe("ProfessionalsRepository", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setupFixture();
  });

  afterEach(async () => {
    await cleanupClinic(fixture.clinicId);
    await cleanupClinic(fixture.otherClinicId);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("lista só profissionais da própria clínica, nunca de outra", async () => {
    const suffix = randomUUID();
    await db
      .insert(professionals)
      .values({
        clinicId: fixture.clinicId,
        name: "Fisio A",
        email: `a-${suffix}@test.local`,
        role: "fisioterapeuta",
      });
    await db.insert(professionals).values({
      clinicId: fixture.otherClinicId,
      name: "Fisio Outra Clínica",
      email: `b-${suffix}@test.local`,
      role: "fisioterapeuta",
    });

    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const result = await repo.listProfessionals({});

    expect(result.map((p) => p.name)).toEqual(["Fisio A"]);
  });

  it("activeOnly filtra profissionais inativos", async () => {
    const suffix = randomUUID();
    await db.insert(professionals).values({
      clinicId: fixture.clinicId,
      name: "Fisio Ativa",
      email: `ativa-${suffix}@test.local`,
      role: "fisioterapeuta",
    });
    await db.insert(professionals).values({
      clinicId: fixture.clinicId,
      name: "Fisio Inativa",
      email: `inativa-${suffix}@test.local`,
      role: "fisioterapeuta",
      active: false,
    });

    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const result = await repo.listProfessionals({ activeOnly: true });

    expect(result.map((p) => p.name)).toEqual(["Fisio Ativa"]);
  });

  it("sem activeOnly retorna ativos e inativos", async () => {
    const suffix = randomUUID();
    await db.insert(professionals).values({
      clinicId: fixture.clinicId,
      name: "Fisio Ativa",
      email: `ativa2-${suffix}@test.local`,
      role: "fisioterapeuta",
    });
    await db.insert(professionals).values({
      clinicId: fixture.clinicId,
      name: "Fisio Inativa",
      email: `inativa2-${suffix}@test.local`,
      role: "fisioterapeuta",
      active: false,
    });

    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const result = await repo.listProfessionals({});

    expect(result).toHaveLength(2);
  });
});
