import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "@/db/client";
import { auditLog, clinics, notifications, patients, professionals, rooms, sessionAttendees, sessions } from "@/db/schema";
import { createNotificationsRepository } from "@/db/repositories/notifications-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { RoomNotFoundError } from "@/db/repositories/scheduling-repository.errors";
import { createSchedulingService } from "./scheduling-service";

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
  roomId: string;
  professionalId: string;
  patientIds: string[];
}

async function setupFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const [clinic] = await db.insert(clinics).values({ name: `Service Test Clinic ${suffix}` }).returning();
  const [professional] = await db
    .insert(professionals)
    .values({ clinicId: clinic!.id, name: "Fisio", email: `fisio-${suffix}@test.local`, role: "fisioterapeuta" })
    .returning();
  const [room] = await db
    .insert(rooms)
    .values({ clinicId: clinic!.id, name: `Sala ${suffix}`, type: "pilates", capacity: 3 })
    .returning();
  const patientRows = await db
    .insert(patients)
    .values(
      Array.from({ length: 3 }, (_, i) => ({
        clinicId: clinic!.id,
        primaryProfessionalId: professional!.id,
        name: `Paciente ${i + 1}`,
        phone: i === 0 ? null : "+5511999990000", // primeiro paciente sem telefone, de propósito
      })),
    )
    .returning();

  return {
    clinicId: clinic!.id,
    roomId: room!.id,
    professionalId: professional!.id,
    patientIds: patientRows.map((p) => p.id),
  };
}

async function cleanupClinic(clinicId: string): Promise<void> {
  await db.delete(auditLog).where(eq(auditLog.clinicId, clinicId));
  await db.delete(notifications).where(eq(notifications.clinicId, clinicId));
  await db.delete(sessionAttendees).where(eq(sessionAttendees.clinicId, clinicId));
  await db.delete(sessions).where(eq(sessions.clinicId, clinicId));
  await db.delete(patients).where(eq(patients.clinicId, clinicId));
  await db.delete(rooms).where(eq(rooms.clinicId, clinicId));
  await db.delete(professionals).where(eq(professionals.clinicId, clinicId));
  await db.delete(clinics).where(eq(clinics.id, clinicId));
}

function buildService(clinicId: string) {
  const schedulingRepository = createSchedulingRepository(db, clinicId);
  const notificationsRepository = createNotificationsRepository(db, clinicId);
  return createSchedulingService(db, schedulingRepository, notificationsRepository);
}

describe("SchedulingService — atomicidade scheduling + notifications", () => {
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

  it("createSession cria session, attendees e confirmações pendentes atomicamente", async () => {
    const service = buildService(fixture.clinicId);

    const result = await service.createSession(
      {
        professionalId: fixture.professionalId,
        roomId: fixture.roomId,
        scheduledStart: new Date("2026-08-10T09:00:00-03:00"),
        scheduledEnd: new Date("2026-08-10T09:50:00-03:00"),
        patientIds: [fixture.patientIds[1]!, fixture.patientIds[2]!], // ambos com telefone
      },
      { type: "professional", professionalId: fixture.professionalId },
    );

    expect(result.attendees).toHaveLength(2);
    const notificationRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.clinicId, fixture.clinicId));
    expect(notificationRows).toHaveLength(2);
    expect(notificationRows.every((n) => n.status === "pendente")).toBe(true);
    // 08:00 -03:00 do dia da sessão (09:00 -03:00) — mesmo dia.
    expect(notificationRows[0]!.scheduledFor.toISOString()).toBe("2026-08-10T11:00:00.000Z");
  });

  it("paciente sem telefone não gera notificação, mas não impede a criação da session/attendee", async () => {
    const service = buildService(fixture.clinicId);

    const result = await service.createSession(
      {
        professionalId: fixture.professionalId,
        roomId: fixture.roomId,
        scheduledStart: new Date("2026-08-10T10:00:00-03:00"),
        scheduledEnd: new Date("2026-08-10T10:50:00-03:00"),
        patientIds: [fixture.patientIds[0]!, fixture.patientIds[1]!], // [0] sem telefone
      },
      { type: "professional", professionalId: fixture.professionalId },
    );

    expect(result.attendees).toHaveLength(2);
    const notificationRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.clinicId, fixture.clinicId));
    expect(notificationRows).toHaveLength(1);
  });

  it("addAttendee cria a confirmação do novo participante atomicamente", async () => {
    const service = buildService(fixture.clinicId);
    const created = await service.createSession(
      {
        professionalId: fixture.professionalId,
        roomId: fixture.roomId,
        scheduledStart: new Date("2026-08-10T11:00:00-03:00"),
        scheduledEnd: new Date("2026-08-10T11:50:00-03:00"),
        patientIds: [fixture.patientIds[1]!],
      },
      { type: "professional", professionalId: fixture.professionalId },
    );

    const result = await service.addAttendee(created.session.id, fixture.patientIds[2]!, {
      type: "professional",
      professionalId: fixture.professionalId,
    });

    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.sessionAttendeeId, result.attendee.id));
    expect(notification).toBeDefined();
    expect(notification!.status).toBe("pendente");
  });

  it("rescheduleSession reagenda confirmações pendentes; não reabre quem já foi notificado", async () => {
    const service = buildService(fixture.clinicId);
    const created = await service.createSession(
      {
        professionalId: fixture.professionalId,
        roomId: fixture.roomId,
        scheduledStart: new Date("2026-08-10T12:00:00-03:00"),
        scheduledEnd: new Date("2026-08-10T12:50:00-03:00"),
        patientIds: [fixture.patientIds[1]!, fixture.patientIds[2]!],
      },
      { type: "professional", professionalId: fixture.professionalId },
    );

    const notificationRepo = createNotificationsRepository(db, fixture.clinicId);
    const beforeRows = await db.select().from(notifications).where(eq(notifications.clinicId, fixture.clinicId));
    // Marca a confirmação do primeiro attendee como já enviada, antes de remarcar.
    await notificationRepo.markSent(beforeRows[0]!.id);

    await service.rescheduleSession(
      {
        sessionId: created.session.id,
        roomId: fixture.roomId,
        scheduledStart: new Date("2026-08-11T12:00:00-03:00"),
        scheduledEnd: new Date("2026-08-11T12:50:00-03:00"),
      },
      { type: "professional", professionalId: fixture.professionalId },
    );

    const afterRows = await db.select().from(notifications).where(eq(notifications.clinicId, fixture.clinicId));
    const sentAfter = afterRows.find((n) => n.id === beforeRows[0]!.id)!;
    const pendingAfter = afterRows.find((n) => n.id === beforeRows[1]!.id)!;

    expect(sentAfter.status).toBe("enviada");
    expect(sentAfter.scheduledFor).toEqual(beforeRows[0]!.scheduledFor); // não mudou
    expect(pendingAfter.status).toBe("pendente");
    expect(pendingAfter.scheduledFor.toISOString()).toBe("2026-08-11T11:00:00.000Z"); // mudou para o novo dia
  });

  it("cancelar um attendee cancela só a confirmação pendente dele, não a dos demais", async () => {
    const service = buildService(fixture.clinicId);
    const created = await service.createSession(
      {
        professionalId: fixture.professionalId,
        roomId: fixture.roomId,
        scheduledStart: new Date("2026-08-10T13:00:00-03:00"),
        scheduledEnd: new Date("2026-08-10T13:50:00-03:00"),
        patientIds: [fixture.patientIds[1]!, fixture.patientIds[2]!],
      },
      { type: "professional", professionalId: fixture.professionalId },
    );

    const [cancelledAttendee, remainingAttendee] = created.attendees;
    await service.updateAttendeeStatus(cancelledAttendee!.id, "cancelada", {
      type: "professional",
      professionalId: fixture.professionalId,
    });

    const rows = await db.select().from(notifications).where(eq(notifications.clinicId, fixture.clinicId));
    const cancelledNotification = rows.find((n) => n.sessionAttendeeId === cancelledAttendee!.id)!;
    const remainingNotification = rows.find((n) => n.sessionAttendeeId === remainingAttendee!.id)!;

    expect(cancelledNotification.status).toBe("cancelada");
    expect(remainingNotification.status).toBe("pendente");
  });

  it("falha no meio da orquestração desfaz tudo — nenhuma session, attendee ou notificação parcial", async () => {
    const service = buildService(fixture.clinicId);

    await expect(
      service.createSession(
        {
          professionalId: fixture.professionalId,
          roomId: randomUUID(), // sala inexistente — RoomNotFoundError dentro da transação
          scheduledStart: new Date("2026-08-10T14:00:00-03:00"),
          scheduledEnd: new Date("2026-08-10T14:50:00-03:00"),
          patientIds: [fixture.patientIds[1]!],
        },
        { type: "professional", professionalId: fixture.professionalId },
      ),
    ).rejects.toBeInstanceOf(RoomNotFoundError);

    const sessionRows = await db.select().from(sessions).where(eq(sessions.clinicId, fixture.clinicId));
    const attendeeRows = await db.select().from(sessionAttendees).where(eq(sessionAttendees.clinicId, fixture.clinicId));
    const notificationRows = await db.select().from(notifications).where(eq(notifications.clinicId, fixture.clinicId));

    expect(sessionRows).toHaveLength(0);
    expect(attendeeRows).toHaveLength(0);
    expect(notificationRows).toHaveLength(0);
  });
});
