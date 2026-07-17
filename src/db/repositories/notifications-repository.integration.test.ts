import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type DbClient } from "../client";
import { clinics, notifications, patients, professionals, rooms, sessionAttendees, sessions } from "../schema";
import { createNotificationsRepository } from "./notifications-repository";
import { InvalidNotificationStatusTransitionError, NotificationNotFoundError } from "./notifications-repository.errors";

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
  createSession: (start: Date, end: Date) => Promise<string>;
  createAttendee: (sessionId: string, phone?: string | null) => Promise<string>;
}

async function setupFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const [clinic] = await db.insert(clinics).values({ name: `Notif Test Clinic ${suffix}` }).returning();
  const [professional] = await db
    .insert(professionals)
    .values({ clinicId: clinic!.id, name: "Fisio", email: `fisio-${suffix}@test.local`, role: "fisioterapeuta" })
    .returning();
  const [room] = await db
    .insert(rooms)
    .values({ clinicId: clinic!.id, name: `Sala ${suffix}`, type: "individual", capacity: 1 })
    .returning();

  const createSession = async (start: Date, end: Date): Promise<string> => {
    const [session] = await db
      .insert(sessions)
      .values({
        clinicId: clinic!.id,
        professionalId: professional!.id,
        roomId: room!.id,
        scheduledStart: start,
        scheduledEnd: end,
      })
      .returning();
    return session!.id;
  };

  const createAttendee = async (sessionId: string, phone: string | null = "+5511999990000"): Promise<string> => {
    const [patient] = await db
      .insert(patients)
      .values({ clinicId: clinic!.id, primaryProfessionalId: professional!.id, name: "Paciente", phone })
      .returning();
    const [attendee] = await db
      .insert(sessionAttendees)
      .values({ clinicId: clinic!.id, sessionId, patientId: patient!.id })
      .returning();
    return attendee!.id;
  };

  return { clinicId: clinic!.id, roomId: room!.id, professionalId: professional!.id, createSession, createAttendee };
}

async function cleanupClinic(clinicId: string): Promise<void> {
  await db.delete(notifications).where(eq(notifications.clinicId, clinicId));
  await db.delete(sessionAttendees).where(eq(sessionAttendees.clinicId, clinicId));
  await db.delete(sessions).where(eq(sessions.clinicId, clinicId));
  await db.delete(patients).where(eq(patients.clinicId, clinicId));
  await db.delete(rooms).where(eq(rooms.clinicId, clinicId));
  await db.delete(professionals).where(eq(professionals.clinicId, clinicId));
  await db.delete(clinics).where(eq(clinics.id, clinicId));
}

describe("NotificationsRepository", () => {
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

  it("createConfirmation cria notificação pendente com os dados corretos", async () => {
    const repo = createNotificationsRepository(db, fixture.clinicId);
    const sessionId = await fixture.createSession(new Date("2026-08-05T09:00:00-03:00"), new Date("2026-08-05T09:50:00-03:00"));
    const attendeeId = await fixture.createAttendee(sessionId);
    const scheduledFor = new Date("2026-08-05T08:00:00-03:00");

    const notification = await repo.createConfirmation({
      sessionAttendeeId: attendeeId,
      channel: "whatsapp_cloud_api",
      scheduledFor,
    });

    expect(notification).not.toBeNull();
    expect(notification?.status).toBe("pendente");
    expect(notification?.template).toBe("session_confirmation");
    expect(notification?.scheduledFor).toEqual(scheduledFor);
  });

  it("createConfirmation retorna null quando o paciente não tem telefone — não é erro", async () => {
    const repo = createNotificationsRepository(db, fixture.clinicId);
    const sessionId = await fixture.createSession(new Date("2026-08-05T10:00:00-03:00"), new Date("2026-08-05T10:50:00-03:00"));
    const attendeeId = await fixture.createAttendee(sessionId, null);

    const notification = await repo.createConfirmation({
      sessionAttendeeId: attendeeId,
      channel: "whatsapp_cloud_api",
      scheduledFor: new Date(),
    });

    expect(notification).toBeNull();
  });

  it("UNIQUE(session_attendee_id, template) impede duplicar a mesma confirmação no banco", async () => {
    const sessionId = await fixture.createSession(new Date("2026-08-05T11:00:00-03:00"), new Date("2026-08-05T11:50:00-03:00"));
    const attendeeId = await fixture.createAttendee(sessionId);
    const values = {
      clinicId: fixture.clinicId,
      sessionAttendeeId: attendeeId,
      channel: "whatsapp_cloud_api" as const,
      template: "session_confirmation",
      scheduledFor: new Date(),
    };
    await db.insert(notifications).values(values);

    await expect(db.insert(notifications).values(values)).rejects.toThrow();
  });

  it("markSent muda de pendente para enviada; falha se não estiver pendente", async () => {
    const repo = createNotificationsRepository(db, fixture.clinicId);
    const sessionId = await fixture.createSession(new Date("2026-08-05T12:00:00-03:00"), new Date("2026-08-05T12:50:00-03:00"));
    const attendeeId = await fixture.createAttendee(sessionId);
    const notification = await repo.createConfirmation({
      sessionAttendeeId: attendeeId,
      channel: "whatsapp_cloud_api",
      scheduledFor: new Date(),
    });

    const sent = await repo.markSent(notification!.id);
    expect(sent.status).toBe("enviada");
    expect(sent.sentAt).not.toBeNull();

    await expect(repo.markSent(notification!.id)).rejects.toBeInstanceOf(InvalidNotificationStatusTransitionError);
  });

  it("markDelivered exige enviada; markFailed aceita pendente ou enviada; recordResponse aceita enviada ou entregue", async () => {
    const repo = createNotificationsRepository(db, fixture.clinicId);

    const sessionId1 = await fixture.createSession(new Date("2026-08-05T13:00:00-03:00"), new Date("2026-08-05T13:50:00-03:00"));
    const attendee1 = await fixture.createAttendee(sessionId1);
    const n1 = await repo.createConfirmation({ sessionAttendeeId: attendee1, channel: "whatsapp_cloud_api", scheduledFor: new Date() });
    await expect(repo.markDelivered(n1!.id)).rejects.toBeInstanceOf(InvalidNotificationStatusTransitionError);
    await repo.markSent(n1!.id);
    const delivered = await repo.markDelivered(n1!.id);
    expect(delivered.status).toBe("entregue");
    const responded = await repo.recordResponse(n1!.id, "confirmado");
    expect(responded.status).toBe("respondida");
    expect(responded.response).toBe("confirmado");

    const sessionId2 = await fixture.createSession(new Date("2026-08-05T14:00:00-03:00"), new Date("2026-08-05T14:50:00-03:00"));
    const attendee2 = await fixture.createAttendee(sessionId2);
    const n2 = await repo.createConfirmation({ sessionAttendeeId: attendee2, channel: "whatsapp_cloud_api", scheduledFor: new Date() });
    const failed = await repo.markFailed(n2!.id, "número inválido");
    expect(failed.status).toBe("falha");
    expect(failed.failureReason).toBe("número inválido");
  });

  it("lança NotificationNotFoundError para id inexistente", async () => {
    const repo = createNotificationsRepository(db, fixture.clinicId);
    await expect(repo.markSent(randomUUID())).rejects.toBeInstanceOf(NotificationNotFoundError);
  });

  it("cancelPendingForAttendee cancela só se pendente; não reabre notificação já enviada", async () => {
    const repo = createNotificationsRepository(db, fixture.clinicId);
    const sessionId = await fixture.createSession(new Date("2026-08-05T15:00:00-03:00"), new Date("2026-08-05T15:50:00-03:00"));

    const pendingAttendee = await fixture.createAttendee(sessionId);
    const pendingNotification = await repo.createConfirmation({
      sessionAttendeeId: pendingAttendee,
      channel: "whatsapp_cloud_api",
      scheduledFor: new Date(),
    });
    await repo.cancelPendingForAttendee(pendingAttendee);
    const [reloadedPending] = await db.select().from(notifications).where(eq(notifications.id, pendingNotification!.id));
    expect(reloadedPending!.status).toBe("cancelada");

    const sentAttendee = await fixture.createAttendee(sessionId);
    const sentNotification = await repo.createConfirmation({
      sessionAttendeeId: sentAttendee,
      channel: "whatsapp_cloud_api",
      scheduledFor: new Date(),
    });
    await repo.markSent(sentNotification!.id);
    await repo.cancelPendingForAttendee(sentAttendee);
    const [reloadedSent] = await db.select().from(notifications).where(eq(notifications.id, sentNotification!.id));
    expect(reloadedSent!.status).toBe("enviada");
  });

  it("rescheduleConfirmationsForSession só atualiza pendentes da sessão; enviada/respondida/cancelada e outras sessões ficam intocadas", async () => {
    const repo = createNotificationsRepository(db, fixture.clinicId);
    const sessionA = await fixture.createSession(new Date("2026-08-05T16:00:00-03:00"), new Date("2026-08-05T16:50:00-03:00"));
    const sessionB = await fixture.createSession(new Date("2026-08-05T17:00:00-03:00"), new Date("2026-08-05T17:50:00-03:00"));

    const pendingAttendee = await fixture.createAttendee(sessionA);
    const pendingNotification = await repo.createConfirmation({
      sessionAttendeeId: pendingAttendee,
      channel: "whatsapp_cloud_api",
      scheduledFor: new Date("2026-08-05T08:00:00-03:00"),
    });

    const sentAttendee = await fixture.createAttendee(sessionA);
    const sentNotification = await repo.createConfirmation({
      sessionAttendeeId: sentAttendee,
      channel: "whatsapp_cloud_api",
      scheduledFor: new Date("2026-08-05T08:00:00-03:00"),
    });
    await repo.markSent(sentNotification!.id);

    const otherSessionAttendee = await fixture.createAttendee(sessionB);
    const otherSessionNotification = await repo.createConfirmation({
      sessionAttendeeId: otherSessionAttendee,
      channel: "whatsapp_cloud_api",
      scheduledFor: new Date("2026-08-05T08:00:00-03:00"),
    });

    const newScheduledFor = new Date("2026-08-06T08:00:00-03:00");
    await repo.rescheduleConfirmationsForSession(sessionA, newScheduledFor);

    const [reloadedPending] = await db.select().from(notifications).where(eq(notifications.id, pendingNotification!.id));
    const [reloadedSent] = await db.select().from(notifications).where(eq(notifications.id, sentNotification!.id));
    const [reloadedOther] = await db.select().from(notifications).where(eq(notifications.id, otherSessionNotification!.id));

    expect(reloadedPending!.scheduledFor).toEqual(newScheduledFor);
    expect(reloadedSent!.scheduledFor).not.toEqual(newScheduledFor); // já enviada, não reaberta
    expect(reloadedOther!.scheduledFor).not.toEqual(newScheduledFor); // outra sessão, intocada
  });

  it("[concorrência] duas chamadas concorrentes de markSent na mesma notificação — só uma vence", async () => {
    const repo = createNotificationsRepository(db, fixture.clinicId);
    const sessionId = await fixture.createSession(new Date("2026-08-05T18:00:00-03:00"), new Date("2026-08-05T18:50:00-03:00"));
    const attendeeId = await fixture.createAttendee(sessionId);
    const notification = await repo.createConfirmation({
      sessionAttendeeId: attendeeId,
      channel: "whatsapp_cloud_api",
      scheduledFor: new Date(),
    });

    const attempts = await Promise.allSettled([repo.markSent(notification!.id), repo.markSent(notification!.id)]);
    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected");

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const failure = failed[0];
    if (failure?.status === "rejected") {
      expect(failure.reason).toBeInstanceOf(InvalidNotificationStatusTransitionError);
    }
  });
});
