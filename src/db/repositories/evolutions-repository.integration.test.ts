import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { auditLog, clinics, evolutions, patients, professionals, rooms, sessionAttendees, sessions } from "../schema";
import { createEvolutionsRepository } from "./evolutions-repository";
import {
  EvolutionAlreadyExistsError,
  EvolutionNotFoundError,
  NotEvolutionAuthorError,
} from "./evolutions-repository.errors";

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
  otherProfessionalId: string;
  patientId: string;
  /** Attendee com status `realizada` — caso feliz de criação de evolução. */
  realizedAttendeeId: string;
  /** Attendee com status `agendada` — usado só para provar que o *chamador*
   * (rota) precisa filtrar por status antes de chegar aqui; o repositório
   * em si não valida status, então este id não é usado para negativa aqui. */
}

async function setupFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const [clinic] = await db.insert(clinics).values({ name: `Evolutions Test Clinic ${suffix}` }).returning();
  const [professional] = await db
    .insert(professionals)
    .values({ clinicId: clinic!.id, name: "Fisio Autora", email: `autora-${suffix}@test.local`, role: "fisioterapeuta" })
    .returning();
  const [otherProfessional] = await db
    .insert(professionals)
    .values({ clinicId: clinic!.id, name: "Fisio Outra", email: `outra-${suffix}@test.local`, role: "fisioterapeuta" })
    .returning();
  const [patient] = await db
    .insert(patients)
    .values({ clinicId: clinic!.id, primaryProfessionalId: professional!.id, name: "Paciente Teste" })
    .returning();
  const [room] = await db
    .insert(rooms)
    .values({ clinicId: clinic!.id, name: `Sala ${suffix}`, type: "individual", capacity: 1 })
    .returning();
  const [session] = await db
    .insert(sessions)
    .values({
      clinicId: clinic!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      scheduledStart: new Date("2026-07-20T09:00:00-03:00"),
      scheduledEnd: new Date("2026-07-20T09:50:00-03:00"),
    })
    .returning();
  const [attendee] = await db
    .insert(sessionAttendees)
    .values({ clinicId: clinic!.id, sessionId: session!.id, patientId: patient!.id, status: "realizada" })
    .returning();

  return {
    clinicId: clinic!.id,
    professionalId: professional!.id,
    otherProfessionalId: otherProfessional!.id,
    patientId: patient!.id,
    realizedAttendeeId: attendee!.id,
  };
}

async function cleanupClinic(clinicId: string): Promise<void> {
  await db.delete(auditLog).where(eq(auditLog.clinicId, clinicId));
  await db.delete(evolutions).where(eq(evolutions.clinicId, clinicId));
  await db.delete(sessionAttendees).where(eq(sessionAttendees.clinicId, clinicId));
  await db.delete(sessions).where(eq(sessions.clinicId, clinicId));
  await db.delete(patients).where(eq(patients.clinicId, clinicId));
  await db.delete(rooms).where(eq(rooms.clinicId, clinicId));
  await db.delete(professionals).where(eq(professionals.clinicId, clinicId));
  await db.delete(clinics).where(eq(clinics.id, clinicId));
}

describe("EvolutionsRepository", () => {
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

  it("createEvolution cria o registro e grava audit_log", async () => {
    const repo = createEvolutionsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };

    const created = await repo.createEvolution(
      { sessionAttendeeId: fixture.realizedAttendeeId, patientId: fixture.patientId, content: "Paciente evoluiu bem." },
      actor,
    );

    expect(created.professionalId).toBe(fixture.professionalId);
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(logs.some((entry) => entry.action === "evolution.created")).toBe(true);
  });

  it("createEvolution rejeita um segundo registro para o mesmo attendee", async () => {
    const repo = createEvolutionsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };
    await repo.createEvolution(
      { sessionAttendeeId: fixture.realizedAttendeeId, patientId: fixture.patientId, content: "Primeira." },
      actor,
    );

    await expect(
      repo.createEvolution(
        { sessionAttendeeId: fixture.realizedAttendeeId, patientId: fixture.patientId, content: "Segunda." },
        actor,
      ),
    ).rejects.toBeInstanceOf(EvolutionAlreadyExistsError);
  });

  it("updateEvolution permite edição pelo autor e grava audit_log com before/after", async () => {
    const repo = createEvolutionsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };
    const created = await repo.createEvolution(
      { sessionAttendeeId: fixture.realizedAttendeeId, patientId: fixture.patientId, content: "Original." },
      actor,
    );

    const updated = await repo.updateEvolution(created.id, { content: "Corrigido." }, actor);

    expect(updated.content).toBe("Corrigido.");
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    const updateLog = logs.find((entry) => entry.action === "evolution.updated");
    expect((updateLog?.before as { content: string } | null)?.content).toBe("Original.");
    expect((updateLog?.after as { content: string } | null)?.content).toBe("Corrigido.");
  });

  it("updateEvolution rejeita edição por outro profissional", async () => {
    const repo = createEvolutionsRepository(db, fixture.clinicId);
    const authorActor = { type: "professional" as const, professionalId: fixture.professionalId };
    const otherActor = { type: "professional" as const, professionalId: fixture.otherProfessionalId };
    const created = await repo.createEvolution(
      { sessionAttendeeId: fixture.realizedAttendeeId, patientId: fixture.patientId, content: "Original." },
      authorActor,
    );

    await expect(repo.updateEvolution(created.id, { content: "Tentativa alheia." }, otherActor)).rejects.toBeInstanceOf(
      NotEvolutionAuthorError,
    );
  });

  it("updateEvolution com id inexistente lança EvolutionNotFoundError", async () => {
    const repo = createEvolutionsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };
    await expect(repo.updateEvolution(randomUUID(), { content: "X" }, actor)).rejects.toBeInstanceOf(
      EvolutionNotFoundError,
    );
  });

  it("listByPatient retorna em ordem cronológica ascendente", async () => {
    const repo = createEvolutionsRepository(db, fixture.clinicId);
    const actor = { type: "professional" as const, professionalId: fixture.professionalId };

    // Cria uma segunda sessão/attendee realizada pra ter uma 2ª evolução do mesmo paciente.
    const [room2] = await db
      .insert(rooms)
      .values({ clinicId: fixture.clinicId, name: `Sala 2 ${randomUUID()}`, type: "individual", capacity: 1 })
      .returning();
    const [session2] = await db
      .insert(sessions)
      .values({
        clinicId: fixture.clinicId,
        professionalId: fixture.professionalId,
        roomId: room2!.id,
        scheduledStart: new Date("2026-07-27T09:00:00-03:00"),
        scheduledEnd: new Date("2026-07-27T09:50:00-03:00"),
      })
      .returning();
    const [attendee2] = await db
      .insert(sessionAttendees)
      .values({ clinicId: fixture.clinicId, sessionId: session2!.id, patientId: fixture.patientId, status: "realizada" })
      .returning();

    await repo.createEvolution(
      { sessionAttendeeId: attendee2!.id, patientId: fixture.patientId, content: "Segunda sessão." },
      actor,
    );
    await repo.createEvolution(
      { sessionAttendeeId: fixture.realizedAttendeeId, patientId: fixture.patientId, content: "Primeira sessão." },
      actor,
    );

    const history = await repo.listByPatient(fixture.patientId);

    // Ordem é por `createdAt` da evolução (quando foi escrita), não pela data
    // da sessão — "Segunda sessão." foi registrada primeiro nesta suíte.
    expect(history.map((e) => e.content)).toEqual(["Segunda sessão.", "Primeira sessão."]);
  });
});
