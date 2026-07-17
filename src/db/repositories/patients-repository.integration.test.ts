import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { auditLog, clinics, patients, professionals } from "../schema";
import { createPatientsRepository } from "./patients-repository";
import {
  InvalidPhoneError,
  PatientNotFoundError,
  ProfessionalInactiveError,
  ProfessionalNotFoundError,
} from "./patients-repository.errors";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL (ou DATABASE_URL) não configurada. Testes de integração exigem um Postgres " +
      "real e alcançável, com as migrations já aplicadas. Ver src/db/repositories/README.md.",
  );
}

const db: DbClient = createDbClient(TEST_DATABASE_URL);

interface Fixture {
  clinicId: string;
  professionalId: string;
  inactiveProfessionalId: string;
}

async function setupFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const [clinic] = await db.insert(clinics).values({ name: `Patients Test Clinic ${suffix}` }).returning();
  const [professional] = await db
    .insert(professionals)
    .values({ clinicId: clinic!.id, name: "Fisio Ativa", email: `fisio-${suffix}@test.local`, role: "fisioterapeuta" })
    .returning();
  const [inactiveProfessional] = await db
    .insert(professionals)
    .values({
      clinicId: clinic!.id,
      name: "Fisio Inativa",
      email: `fisio-inativa-${suffix}@test.local`,
      role: "fisioterapeuta",
      active: false,
    })
    .returning();

  return { clinicId: clinic!.id, professionalId: professional!.id, inactiveProfessionalId: inactiveProfessional!.id };
}

async function cleanupClinic(clinicId: string): Promise<void> {
  await db.delete(auditLog).where(eq(auditLog.clinicId, clinicId));
  await db.delete(patients).where(eq(patients.clinicId, clinicId));
  await db.delete(professionals).where(eq(professionals.clinicId, clinicId));
  await db.delete(clinics).where(eq(clinics.id, clinicId));
}

describe("PatientsRepository", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await setupFixture();
  });

  afterEach(async () => {
    await cleanupClinic(fixture.clinicId);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("createPatient cria o registro, normaliza telefone e grava audit_log", async () => {
    const repo = createPatientsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };

    const patient = await repo.createPatient(
      { primaryProfessionalId: fixture.professionalId, name: "Paciente Teste", phone: "(11) 99999-8888" },
      actor,
    );

    expect(patient.name).toBe("Paciente Teste");
    expect(patient.phone).toBe("+5511999998888");
    expect(patient.active).toBe(true);

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, patient.id));
    expect(entry).toBeDefined();
    expect(entry!.action).toBe("patient.created");
    expect(entry!.entityType).toBe("patient");
    expect(entry!.actorId).toBe(fixture.professionalId);
  });

  it("createPatient aceita telefone nulo", async () => {
    const repo = createPatientsRepository(db, fixture.clinicId);
    const patient = await repo.createPatient(
      { primaryProfessionalId: fixture.professionalId, name: "Sem Telefone" },
      { type: "professional", professionalId: fixture.professionalId },
    );
    expect(patient.phone).toBeNull();
  });

  it("createPatient rejeita telefone em formato inválido", async () => {
    const repo = createPatientsRepository(db, fixture.clinicId);
    await expect(
      repo.createPatient(
        { primaryProfessionalId: fixture.professionalId, name: "X", phone: "abc" },
        { type: "professional", professionalId: fixture.professionalId },
      ),
    ).rejects.toBeInstanceOf(InvalidPhoneError);
  });

  it("createPatient rejeita profissional inexistente ou inativo", async () => {
    const repo = createPatientsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };

    await expect(
      repo.createPatient({ primaryProfessionalId: randomUUID(), name: "X" }, actor),
    ).rejects.toBeInstanceOf(ProfessionalNotFoundError);

    await expect(
      repo.createPatient({ primaryProfessionalId: fixture.inactiveProfessionalId, name: "X" }, actor),
    ).rejects.toBeInstanceOf(ProfessionalInactiveError);
  });

  it("getPatient retorna null para id inexistente", async () => {
    const repo = createPatientsRepository(db, fixture.clinicId);
    expect(await repo.getPatient(randomUUID())).toBeNull();
  });

  it("listPatients filtra por professionalId e activeOnly", async () => {
    const repo = createPatientsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };
    const active = await repo.createPatient({ primaryProfessionalId: fixture.professionalId, name: "Ativo" }, actor);
    const toDeactivate = await repo.createPatient(
      { primaryProfessionalId: fixture.professionalId, name: "Vai Desativar" },
      actor,
    );
    await repo.deactivatePatient(toDeactivate.id, actor);

    const all = await repo.listPatients({ professionalId: fixture.professionalId });
    const onlyActive = await repo.listPatients({ professionalId: fixture.professionalId, activeOnly: true });

    expect(all.map((p) => p.id).sort()).toEqual([active.id, toDeactivate.id].sort());
    expect(onlyActive.map((p) => p.id)).toEqual([active.id]);
  });

  it("updatePatient atualiza campos, normaliza telefone e grava audit_log com before/after", async () => {
    const repo = createPatientsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };
    const patient = await repo.createPatient(
      { primaryProfessionalId: fixture.professionalId, name: "Nome Antigo", phone: "11999998888" },
      actor,
    );

    const updated = await repo.updatePatient(patient.id, { name: "Nome Novo", phone: "11888887777" }, actor);

    expect(updated.name).toBe("Nome Novo");
    expect(updated.phone).toBe("+5511888887777");
    expect(updated.updatedAt.getTime()).toBeGreaterThan(updated.createdAt.getTime() - 1);

    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, patient.id));
    const updateEntry = entries.find((e) => e.action === "patient.updated");
    expect(updateEntry).toBeDefined();
    expect((updateEntry!.before as { name: string }).name).toBe("Nome Antigo");
    expect((updateEntry!.after as { name: string }).name).toBe("Nome Novo");
  });

  it("updatePatient com id inexistente lança PatientNotFoundError", async () => {
    const repo = createPatientsRepository(db, fixture.clinicId);
    await expect(
      repo.updatePatient(randomUUID(), { name: "X" }, { type: "professional", professionalId: fixture.professionalId }),
    ).rejects.toBeInstanceOf(PatientNotFoundError);
  });

  it("deactivatePatient marca active=false, grava audit_log, e é idempotente (sem novo registro na 2ª chamada)", async () => {
    const repo = createPatientsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };
    const patient = await repo.createPatient({ primaryProfessionalId: fixture.professionalId, name: "X" }, actor);

    const deactivated = await repo.deactivatePatient(patient.id, actor);
    expect(deactivated.active).toBe(false);

    const entriesAfterFirst = await db.select().from(auditLog).where(eq(auditLog.entityId, patient.id));
    const deactivationEntries = entriesAfterFirst.filter((e) => e.action === "patient.deactivated");
    expect(deactivationEntries).toHaveLength(1);

    const secondCall = await repo.deactivatePatient(patient.id, actor);
    expect(secondCall.active).toBe(false);

    const entriesAfterSecond = await db.select().from(auditLog).where(eq(auditLog.entityId, patient.id));
    expect(entriesAfterSecond.filter((e) => e.action === "patient.deactivated")).toHaveLength(1);
  });
});
