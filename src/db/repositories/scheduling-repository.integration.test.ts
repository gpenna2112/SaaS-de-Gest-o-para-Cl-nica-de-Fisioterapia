import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { auditLog, clinics, patients, professionals, rooms, sessionAttendees, sessions } from "../schema";
import { createSchedulingRepository } from "./scheduling-repository";
import {
  DuplicatePatientIdsError,
  NoPatientsProvidedError,
  PatientNotFoundError,
  ProfessionalConflictError,
  RoomAtCapacityError,
  RoomConflictError,
  SchedulingConflictError,
} from "./scheduling-repository.errors";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL (ou DATABASE_URL) não configurada. Testes de integração exigem um Postgres " +
      "real e alcançável, com as migrations já aplicadas. Ver src/db/repositories/README.md.",
  );
}

const db: DbClient = createDbClient(TEST_DATABASE_URL);

interface TestFixture {
  clinicId: string;
  professionalId: string;
  professionalId2: string;
  patientIds: string[]; // 4 pacientes distintos, suficiente para os cenários de capacidade 3
}

async function setupClinic(): Promise<TestFixture> {
  const suffix = randomUUID();
  const [clinic] = await db.insert(clinics).values({ name: `Integration Test Clinic ${suffix}` }).returning();
  const [professional] = await db
    .insert(professionals)
    .values({ clinicId: clinic!.id, name: "Fisio A", email: `fisio-a-${suffix}@integration.test`, role: "fisioterapeuta" })
    .returning();
  const [professional2] = await db
    .insert(professionals)
    .values({ clinicId: clinic!.id, name: "Fisio B", email: `fisio-b-${suffix}@integration.test`, role: "fisioterapeuta" })
    .returning();

  const patientRows = await db
    .insert(patients)
    .values(
      Array.from({ length: 4 }, (_, i) => ({
        clinicId: clinic!.id,
        primaryProfessionalId: professional!.id,
        name: `Paciente ${i + 1}`,
      })),
    )
    .returning();

  return {
    clinicId: clinic!.id,
    professionalId: professional!.id,
    professionalId2: professional2!.id,
    patientIds: patientRows.map((p) => p.id),
  };
}

async function createRoom(clinicId: string, capacity: number) {
  const [room] = await db
    .insert(rooms)
    .values({ clinicId, name: `Sala ${randomUUID()}`, type: capacity > 1 ? "pilates" : "individual", capacity })
    .returning();
  return room!;
}

async function cleanupClinic(clinicId: string): Promise<void> {
  await db.delete(auditLog).where(eq(auditLog.clinicId, clinicId));
  await db.delete(sessionAttendees).where(eq(sessionAttendees.clinicId, clinicId));
  await db.delete(sessions).where(eq(sessions.clinicId, clinicId));
  await db.delete(patients).where(eq(patients.clinicId, clinicId));
  await db.delete(rooms).where(eq(rooms.clinicId, clinicId));
  await db.delete(professionals).where(eq(professionals.clinicId, clinicId));
  await db.delete(clinics).where(eq(clinics.id, clinicId));
}

describe("SchedulingRepository — modelo session/session_attendees", () => {
  let fixture: TestFixture;

  beforeEach(async () => {
    fixture = await setupClinic();
  });

  afterEach(async () => {
    await cleanupClinic(fixture.clinicId);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("cria sessão de Pilates com múltiplos pacientes na mesma turma, um único profissional", async () => {
    const { clinicId, professionalId, patientIds } = fixture;
    const room = await createRoom(clinicId, 3);
    const repo = createSchedulingRepository(db, clinicId);

    const { session, attendees } = await repo.createSession(
      {
        professionalId,
        roomId: room.id,
        scheduledStart: new Date("2026-08-03T09:00:00-03:00"),
        scheduledEnd: new Date("2026-08-03T09:50:00-03:00"),
        patientIds: patientIds.slice(0, 3),
      },
      { type: "professional", professionalId },
    );

    expect(session.professionalId).toBe(professionalId);
    expect(attendees).toHaveLength(3);
    expect(attendees.every((a) => a.status === "agendada")).toBe(true);
    expect(new Set(attendees.map((a) => a.patientId))).toEqual(new Set(patientIds.slice(0, 3)));
  });

  it("impede criar sessão com mais pacientes que a capacidade da sala", async () => {
    const { clinicId, professionalId, patientIds } = fixture;
    const room = await createRoom(clinicId, 1);
    const repo = createSchedulingRepository(db, clinicId);

    await expect(
      repo.createSession(
        {
          professionalId,
          roomId: room.id,
          scheduledStart: new Date("2026-08-03T10:00:00-03:00"),
          scheduledEnd: new Date("2026-08-03T10:50:00-03:00"),
          patientIds: patientIds.slice(0, 2),
        },
        { type: "professional", professionalId },
      ),
    ).rejects.toBeInstanceOf(RoomAtCapacityError);
  });

  it("impede lista de pacientes vazia", async () => {
    const { clinicId, professionalId } = fixture;
    const room = await createRoom(clinicId, 1);
    const repo = createSchedulingRepository(db, clinicId);

    await expect(
      repo.createSession(
        {
          professionalId,
          roomId: room.id,
          scheduledStart: new Date("2026-08-03T11:00:00-03:00"),
          scheduledEnd: new Date("2026-08-03T11:50:00-03:00"),
          patientIds: [],
        },
        { type: "professional", professionalId },
      ),
    ).rejects.toBeInstanceOf(NoPatientsProvidedError);
  });

  it("impede IDs de paciente duplicados", async () => {
    const { clinicId, professionalId, patientIds } = fixture;
    const room = await createRoom(clinicId, 3);
    const repo = createSchedulingRepository(db, clinicId);

    await expect(
      repo.createSession(
        {
          professionalId,
          roomId: room.id,
          scheduledStart: new Date("2026-08-03T12:00:00-03:00"),
          scheduledEnd: new Date("2026-08-03T12:50:00-03:00"),
          patientIds: [patientIds[0]!, patientIds[0]!],
        },
        { type: "professional", professionalId },
      ),
    ).rejects.toBeInstanceOf(DuplicatePatientIdsError);
  });

  it("valida todos os pacientes antes de escrever — nenhuma escrita parcial se um patientId não existir", async () => {
    const { clinicId, professionalId, patientIds } = fixture;
    const room = await createRoom(clinicId, 3);
    const repo = createSchedulingRepository(db, clinicId);
    const bogusPatientId = randomUUID();

    await expect(
      repo.createSession(
        {
          professionalId,
          roomId: room.id,
          scheduledStart: new Date("2026-08-03T13:00:00-03:00"),
          scheduledEnd: new Date("2026-08-03T13:50:00-03:00"),
          patientIds: [patientIds[0]!, bogusPatientId],
        },
        { type: "professional", professionalId },
      ),
    ).rejects.toBeInstanceOf(PatientNotFoundError);

    const remainingSessions = await db.select().from(sessions).where(eq(sessions.clinicId, clinicId));
    const remainingAttendees = await db.select().from(sessionAttendees).where(eq(sessionAttendees.clinicId, clinicId));
    expect(remainingSessions).toHaveLength(0);
    expect(remainingAttendees).toHaveLength(0);
  });

  it("apenas uma session ativa pode ocupar a mesma sala no mesmo intervalo", async () => {
    const { clinicId, professionalId, professionalId2, patientIds } = fixture;
    const room = await createRoom(clinicId, 3);
    const repo = createSchedulingRepository(db, clinicId);
    const start = new Date("2026-08-03T14:00:00-03:00");
    const end = new Date("2026-08-03T14:50:00-03:00");

    await repo.createSession(
      { professionalId, roomId: room.id, scheduledStart: start, scheduledEnd: end, patientIds: [patientIds[0]!] },
      { type: "professional", professionalId },
    );

    await expect(
      repo.createSession(
        {
          professionalId: professionalId2,
          roomId: room.id,
          scheduledStart: start,
          scheduledEnd: end,
          patientIds: [patientIds[1]!],
        },
        { type: "professional", professionalId: professionalId2 },
      ),
    ).rejects.toBeInstanceOf(RoomConflictError);
  });

  it("um profissional não pode conduzir duas sessions ativas sobrepostas, mesmo em salas diferentes", async () => {
    const { clinicId, professionalId, patientIds } = fixture;
    const roomA = await createRoom(clinicId, 1);
    const roomB = await createRoom(clinicId, 1);
    const repo = createSchedulingRepository(db, clinicId);
    const start = new Date("2026-08-03T15:00:00-03:00");
    const end = new Date("2026-08-03T15:50:00-03:00");

    await repo.createSession(
      { professionalId, roomId: roomA.id, scheduledStart: start, scheduledEnd: end, patientIds: [patientIds[0]!] },
      { type: "professional", professionalId },
    );

    await expect(
      repo.createSession(
        { professionalId, roomId: roomB.id, scheduledStart: start, scheduledEnd: end, patientIds: [patientIds[1]!] },
        { type: "professional", professionalId },
      ),
    ).rejects.toBeInstanceOf(ProfessionalConflictError);
  });

  it("cancelar um attendee não cancela os demais nem a session", async () => {
    const { clinicId, professionalId, patientIds } = fixture;
    const room = await createRoom(clinicId, 3);
    const repo = createSchedulingRepository(db, clinicId);

    const { session, attendees } = await repo.createSession(
      {
        professionalId,
        roomId: room.id,
        scheduledStart: new Date("2026-08-03T16:00:00-03:00"),
        scheduledEnd: new Date("2026-08-03T16:50:00-03:00"),
        patientIds: patientIds.slice(0, 2),
      },
      { type: "professional", professionalId },
    );

    await repo.updateAttendeeStatus(attendees[0]!.id, "cancelada", { type: "professional", professionalId });

    const [reloadedSession] = await db.select().from(sessions).where(eq(sessions.id, session.id));
    const [otherAttendee] = await db
      .select()
      .from(sessionAttendees)
      .where(eq(sessionAttendees.id, attendees[1]!.id));

    expect(reloadedSession!.status).toBe("ativa");
    expect(otherAttendee!.status).toBe("agendada");
  });

  it("cancelar o último attendee ativo cancela a session automaticamente", async () => {
    const { clinicId, professionalId, patientIds } = fixture;
    const room = await createRoom(clinicId, 1);
    const repo = createSchedulingRepository(db, clinicId);

    const { session, attendees } = await repo.createSession(
      {
        professionalId,
        roomId: room.id,
        scheduledStart: new Date("2026-08-03T17:00:00-03:00"),
        scheduledEnd: new Date("2026-08-03T17:50:00-03:00"),
        patientIds: [patientIds[0]!],
      },
      { type: "professional", professionalId },
    );

    const updatedAttendee = await repo.updateAttendeeStatus(attendees[0]!.id, "cancelada", {
      type: "professional",
      professionalId,
    });
    expect(updatedAttendee.status).toBe("cancelada");

    const [reloadedSession] = await db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(reloadedSession!.status).toBe("cancelada");
  });

  it("depois do auto-cancelamento, a sala/horário fica livre para uma nova session", async () => {
    const { clinicId, professionalId, professionalId2, patientIds } = fixture;
    const room = await createRoom(clinicId, 1);
    const repo = createSchedulingRepository(db, clinicId);
    const start = new Date("2026-08-03T18:00:00-03:00");
    const end = new Date("2026-08-03T18:50:00-03:00");

    const { attendees } = await repo.createSession(
      { professionalId, roomId: room.id, scheduledStart: start, scheduledEnd: end, patientIds: [patientIds[0]!] },
      { type: "professional", professionalId },
    );
    await repo.updateAttendeeStatus(attendees[0]!.id, "cancelada", { type: "professional", professionalId });

    const { session: newSession } = await repo.createSession(
      {
        professionalId: professionalId2,
        roomId: room.id,
        scheduledStart: start,
        scheduledEnd: end,
        patientIds: [patientIds[1]!],
      },
      { type: "professional", professionalId: professionalId2 },
    );

    expect(newSession.status).toBe("ativa");
  });

  it("[concorrência] respeita a capacidade de attendees sob adições concorrentes reais", async () => {
    const { clinicId, professionalId, patientIds } = fixture;
    const room = await createRoom(clinicId, 3);
    const repo = createSchedulingRepository(db, clinicId);

    const { session } = await repo.createSession(
      {
        professionalId,
        roomId: room.id,
        scheduledStart: new Date("2026-08-03T19:00:00-03:00"),
        scheduledEnd: new Date("2026-08-03T19:50:00-03:00"),
        patientIds: [patientIds[0]!],
      },
      { type: "professional", professionalId },
    );

    // 1 vaga já ocupada, capacidade 3 → sobram 2 vagas para 3 tentativas concorrentes.
    const extraPatients = [patientIds[1]!, patientIds[2]!, patientIds[3]!];
    const attempts = await Promise.allSettled(
      extraPatients.map((patientId) =>
        repo.addAttendee(session.id, patientId, { type: "professional", professionalId }),
      ),
    );

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected");
    expect(succeeded).toHaveLength(2);
    expect(failed).toHaveLength(1);
    for (const outcome of failed) {
      if (outcome.status === "rejected") {
        const isExpected = outcome.reason instanceof RoomAtCapacityError || outcome.reason instanceof SchedulingConflictError;
        expect(isExpected).toBe(true);
      }
    }
  });

  it("[concorrência] apenas uma criação vence quando duas disputam a mesma sala/horário", async () => {
    const { clinicId, professionalId, professionalId2, patientIds } = fixture;
    const room = await createRoom(clinicId, 1);
    const repo = createSchedulingRepository(db, clinicId);
    const start = new Date("2026-08-03T20:00:00-03:00");
    const end = new Date("2026-08-03T20:50:00-03:00");

    const attempts = await Promise.allSettled([
      repo.createSession(
        { professionalId, roomId: room.id, scheduledStart: start, scheduledEnd: end, patientIds: [patientIds[0]!] },
        { type: "professional", professionalId },
      ),
      repo.createSession(
        {
          professionalId: professionalId2,
          roomId: room.id,
          scheduledStart: start,
          scheduledEnd: end,
          patientIds: [patientIds[1]!],
        },
        { type: "professional", professionalId: professionalId2 },
      ),
    ]);

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    expect(succeeded).toHaveLength(1);
  });

  it("[concorrência] profissional não termina com duas sessions ativas sobrepostas mesmo sob corrida real", async () => {
    const { clinicId, professionalId, patientIds } = fixture;
    const roomA = await createRoom(clinicId, 1);
    const roomB = await createRoom(clinicId, 1);
    const repo = createSchedulingRepository(db, clinicId);
    const start = new Date("2026-08-03T21:00:00-03:00");
    const end = new Date("2026-08-03T21:50:00-03:00");

    const attempts = await Promise.allSettled([
      repo.createSession(
        { professionalId, roomId: roomA.id, scheduledStart: start, scheduledEnd: end, patientIds: [patientIds[0]!] },
        { type: "professional", professionalId },
      ),
      repo.createSession(
        { professionalId, roomId: roomB.id, scheduledStart: start, scheduledEnd: end, patientIds: [patientIds[1]!] },
        { type: "professional", professionalId },
      ),
    ]);

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    expect(succeeded).toHaveLength(1);

    const activeSessions = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.clinicId, clinicId), eq(sessions.professionalId, professionalId), eq(sessions.status, "ativa")));
    expect(activeSessions).toHaveLength(1);
  });
});
