import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { auditLog, clinics, professionals } from "../schema";
import { createProfessionalsRepository } from "./professionals-repository";
import { DuplicateProfessionalEmailError, ProfessionalRecordNotFoundError } from "./professionals-repository.errors";

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
  /** Profissional real, já existente — `audit_log.actor_id` tem FK para
   * `professionals.id`, então o ator de uma mutação de teste precisa ser
   * uma linha que já existe (não um UUID aleatório). */
  actorProfessionalId: string;
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
  // Ator fica na "outra" clínica de propósito: `audit_log.actor_id` exige
  // uma linha real de `professionals` (FK), mas não deve contaminar a
  // contagem de profissionais da clínica sob teste nos casos de listagem.
  const [actor] = await db
    .insert(professionals)
    .values({ clinicId: otherClinic!.id, name: "Gestora Atriz", email: `atriz-${suffix}@test.local`, role: "gestora" })
    .returning();
  return { clinicId: clinic!.id, otherClinicId: otherClinic!.id, actorProfessionalId: actor!.id };
}

async function cleanupClinic(clinicId: string): Promise<void> {
  await db.delete(auditLog).where(eq(auditLog.clinicId, clinicId));
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

  it("createProfessional cria o registro e grava audit_log", async () => {
    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();

    const created = await repo.createProfessional(
      { name: "Nova Fisio", email: `nova-${suffix}@test.local`, role: "fisioterapeuta" },
      actor,
    );

    expect(created.active).toBe(true);
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(logs.some((entry) => entry.action === "professional.created")).toBe(true);
  });

  it("createProfessional rejeita e-mail já usado na mesma clínica", async () => {
    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const email = `dup-${suffix}@test.local`;
    await repo.createProfessional({ name: "A", email, role: "fisioterapeuta" }, actor);

    await expect(repo.createProfessional({ name: "B", email, role: "fisioterapeuta" }, actor)).rejects.toBeInstanceOf(
      DuplicateProfessionalEmailError,
    );
  });

  it("createProfessional permite o mesmo e-mail em clínicas diferentes", async () => {
    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const otherRepo = createProfessionalsRepository(db, fixture.otherClinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const email = `shared-${suffix}@test.local`;

    await repo.createProfessional({ name: "A", email, role: "fisioterapeuta" }, actor);
    await expect(otherRepo.createProfessional({ name: "B", email, role: "fisioterapeuta" }, actor)).resolves.toBeDefined();
  });

  it("duas criações concorrentes com o mesmo e-mail: só uma sucede, a outra recebe DuplicateProfessionalEmailError", async () => {
    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const email = `race-${suffix}@test.local`;

    const results = await Promise.allSettled([
      repo.createProfessional({ name: "Concorrente A", email, role: "fisioterapeuta" }, actor),
      repo.createProfessional({ name: "Concorrente B", email, role: "fisioterapeuta" }, actor),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateProfessionalEmailError);

    const rows = await db.select().from(professionals).where(eq(professionals.email, email));
    expect(rows).toHaveLength(1);
  });

  it("updateProfessional atualiza campos e grava audit_log com before/after", async () => {
    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const created = await repo.createProfessional(
      { name: "Original", email: `orig-${suffix}@test.local`, role: "fisioterapeuta" },
      actor,
    );

    const updated = await repo.updateProfessional(created.id, { role: "gestora" }, actor);

    expect(updated.role).toBe("gestora");
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    const updateLog = logs.find((entry) => entry.action === "professional.updated");
    expect((updateLog?.before as { role: string } | null)?.role).toBe("fisioterapeuta");
    expect((updateLog?.after as { role: string } | null)?.role).toBe("gestora");
  });

  it("updateProfessional com id inexistente lança ProfessionalRecordNotFoundError", async () => {
    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    await expect(repo.updateProfessional(randomUUID(), { name: "X" }, actor)).rejects.toBeInstanceOf(
      ProfessionalRecordNotFoundError,
    );
  });

  it("deactivateProfessional/reactivateProfessional são idempotentes e auditados", async () => {
    const repo = createProfessionalsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.actorProfessionalId };
    const suffix = randomUUID();
    const created = await repo.createProfessional(
      { name: "Toggle", email: `toggle-${suffix}@test.local`, role: "fisioterapeuta" },
      actor,
    );

    const deactivated = await repo.deactivateProfessional(created.id, actor);
    expect(deactivated.active).toBe(false);
    const deactivatedAgain = await repo.deactivateProfessional(created.id, actor);
    expect(deactivatedAgain.active).toBe(false);

    const reactivated = await repo.reactivateProfessional(created.id, actor);
    expect(reactivated.active).toBe(true);

    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(logs.filter((entry) => entry.action === "professional.deactivated")).toHaveLength(1);
    expect(logs.filter((entry) => entry.action === "professional.reactivated")).toHaveLength(1);
  });
});
