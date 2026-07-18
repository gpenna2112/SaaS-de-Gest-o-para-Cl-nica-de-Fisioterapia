import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { auditLog, clinics, professionals } from "../schema";
import { createProfessionalsAuthRepository } from "./professionals-auth-repository";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL (ou DATABASE_URL) não configurada. Testes de integração exigem um Postgres " +
      "real e alcançável, com as migrations já aplicadas. Ver src/db/repositories/README.md.",
  );
}

const db: DbClient = createDbClient(TEST_DATABASE_URL);

async function cleanupClinics(clinicIds: string[]): Promise<void> {
  for (const clinicId of clinicIds) {
    await db.delete(auditLog).where(eq(auditLog.clinicId, clinicId));
    await db.delete(professionals).where(eq(professionals.clinicId, clinicId));
    await db.delete(clinics).where(eq(clinics.id, clinicId));
  }
}

describe("ProfessionalsAuthRepository", () => {
  const createdClinicIds: string[] = [];

  afterEach(async () => {
    await cleanupClinics(createdClinicIds);
    createdClinicIds.length = 0;
  });

  afterAll(async () => {
    await db.$client.end();
  });

  async function createClinic(): Promise<string> {
    const [clinic] = await db.insert(clinics).values({ name: `Auth Test Clinic ${randomUUID()}` }).returning();
    createdClinicIds.push(clinic!.id);
    return clinic!.id;
  }

  it("findByAuthUserId retorna null quando não há vínculo", async () => {
    const repo = createProfessionalsAuthRepository(db);
    expect(await repo.findByAuthUserId(randomUUID())).toBeNull();
  });

  it("findByAuthUserId encontra o profissional vinculado", async () => {
    const clinicId = await createClinic();
    const suffix = randomUUID();
    const [professional] = await db
      .insert(professionals)
      .values({
        clinicId,
        name: "Fisio",
        email: `fisio-${suffix}@test.local`,
        role: "fisioterapeuta",
        authUserId: `auth-user-${suffix}`,
      })
      .returning();

    const repo = createProfessionalsAuthRepository(db);
    const found = await repo.findByAuthUserId(`auth-user-${suffix}`);
    expect(found?.id).toBe(professional!.id);
  });

  it("findUnclaimedByEmail só retorna profissionais sem authUserId", async () => {
    const clinicId = await createClinic();
    const suffix = randomUUID();
    const email = `fisio-${suffix}@test.local`;
    const [unclaimed] = await db
      .insert(professionals)
      .values({ clinicId, name: "Sem Vínculo", email, role: "fisioterapeuta" })
      .returning();

    const repo = createProfessionalsAuthRepository(db);
    const results = await repo.findUnclaimedByEmail(email);
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(unclaimed!.id);
  });

  it("findUnclaimedByEmail não retorna profissional já vinculado", async () => {
    const clinicId = await createClinic();
    const suffix = randomUUID();
    const email = `fisio-${suffix}@test.local`;
    await db.insert(professionals).values({
      clinicId,
      name: "Já Vinculado",
      email,
      role: "fisioterapeuta",
      authUserId: `auth-user-${suffix}`,
    });

    const repo = createProfessionalsAuthRepository(db);
    expect(await repo.findUnclaimedByEmail(email)).toHaveLength(0);
  });

  it("findUnclaimedByEmail retorna mais de um resultado quando o e-mail aparece em clínicas diferentes — caso ambíguo que o chamador deve tratar", async () => {
    const clinicIdA = await createClinic();
    const clinicIdB = await createClinic();
    const suffix = randomUUID();
    const email = `fisio-${suffix}@test.local`;
    await db.insert(professionals).values({ clinicId: clinicIdA, name: "Clínica A", email, role: "fisioterapeuta" });
    await db.insert(professionals).values({ clinicId: clinicIdB, name: "Clínica B", email, role: "fisioterapeuta" });

    const repo = createProfessionalsAuthRepository(db);
    const results = await repo.findUnclaimedByEmail(email);
    expect(results).toHaveLength(2);
  });

  it("linkAuthUser vincula e grava audit_log", async () => {
    const clinicId = await createClinic();
    const suffix = randomUUID();
    const [professional] = await db
      .insert(professionals)
      .values({ clinicId, name: "A Vincular", email: `fisio-${suffix}@test.local`, role: "fisioterapeuta" })
      .returning();

    const repo = createProfessionalsAuthRepository(db);
    const authUserId = `auth-user-${suffix}`;
    const updated = await repo.linkAuthUser(professional!.id, authUserId, {
      type: "professional",
      professionalId: professional!.id,
    });

    expect(updated.authUserId).toBe(authUserId);

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, professional!.id));
    expect(entry?.action).toBe("professional.auth_linked");
    expect(entry?.entityType).toBe("professional");
  });
});
