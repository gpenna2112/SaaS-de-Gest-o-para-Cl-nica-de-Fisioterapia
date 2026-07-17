import { and, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTransaction } from "drizzle-orm/pg-core";
import { isValidStatusTransition, type AttendeeStatus } from "@/modules/scheduling/session-state-machine";
import type { DbClient } from "../client";
import { auditLog, patients, rooms, sessionAttendees, sessions } from "../schema";
import { withSerializableRetry } from "../transaction-retry";
import {
  DuplicatePatientIdsError,
  InvalidStatusTransitionError,
  NoPatientsProvidedError,
  PatientAlreadyAttendingError,
  PatientNotFoundError,
  ProfessionalConflictError,
  RoomAtCapacityError,
  RoomConflictError,
  RoomNotFoundError,
  SessionAttendeeNotFoundError,
  SessionNotActiveError,
  SessionNotFoundError,
} from "./scheduling-repository.errors";

export type Session = typeof sessions.$inferSelect;
export type SessionAttendee = typeof sessionAttendees.$inferSelect;
/** Status da session em si — `ativa`/`cancelada`. Não confundir com AttendeeStatus (por participante). */
export type SessionStatus = "ativa" | "cancelada";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, any, any>;

export interface Actor {
  type: "professional" | "patient_reply" | "system";
  professionalId?: string;
}

export interface CreateSessionInput {
  professionalId: string;
  roomId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  patientIds: string[];
}

export interface CreateSessionResult {
  session: Session;
  attendees: SessionAttendee[];
}

export interface RescheduleSessionInput {
  sessionId: string;
  roomId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

export interface SchedulingRepository {
  createSession(input: CreateSessionInput, actor: Actor): Promise<CreateSessionResult>;
  addAttendee(sessionId: string, patientId: string, actor: Actor): Promise<SessionAttendee>;
  rescheduleSession(input: RescheduleSessionInput, actor: Actor): Promise<Session>;
  updateAttendeeStatus(attendeeId: string, status: AttendeeStatus, actor: Actor): Promise<SessionAttendee>;
}

/**
 * INSERT/UPDATE .returning() é tipado como array (noUncheckedIndexedAccess).
 * As chamadas abaixo sempre têm exatamente uma linha de efeito (values()
 * fixos ou WHERE que já validamos apontar para uma linha existente na mesma
 * transação) — se vier undefined é bug interno, não caso de negócio.
 */
function assertRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }
  return row;
}

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    } else {
      seen.add(id);
    }
  }
  return [...duplicates];
}

function overlapsRange(startCol: PgColumn, endCol: PgColumn, start: Date, end: Date): SQL {
  return sql`tstzrange(${startCol}, ${endCol}) && tstzrange(${start.toISOString()}, ${end.toISOString()})`;
}

function sessionAuditSnapshot(session: Pick<Session, "roomId" | "scheduledStart" | "scheduledEnd" | "status">) {
  return {
    roomId: session.roomId,
    scheduledStart: session.scheduledStart,
    scheduledEnd: session.scheduledEnd,
    status: session.status,
  };
}

function attendeeAuditSnapshot(attendee: Pick<SessionAttendee, "status" | "confirmedAt">) {
  return { status: attendee.status, confirmedAt: attendee.confirmedAt };
}

async function fetchRoom(tx: Tx, clinicId: string, roomId: string) {
  const [room] = await tx
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.clinicId, clinicId)));
  return room;
}

async function fetchSession(tx: Tx, clinicId: string, sessionId: string) {
  const [session] = await tx
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.clinicId, clinicId)));
  return session;
}

async function fetchAttendee(tx: Tx, clinicId: string, attendeeId: string) {
  const [attendee] = await tx
    .select()
    .from(sessionAttendees)
    .where(and(eq(sessionAttendees.id, attendeeId), eq(sessionAttendees.clinicId, clinicId)));
  return attendee;
}

async function fetchExistingPatientIds(tx: Tx, clinicId: string, patientIds: string[]): Promise<Set<string>> {
  const rows = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), inArray(patients.id, patientIds)));
  return new Set(rows.map((row) => row.id));
}

async function hasActiveRoomConflict(
  tx: Tx,
  clinicId: string,
  roomId: string,
  start: Date,
  end: Date,
  excludeSessionId?: string,
): Promise<boolean> {
  const conditions = [
    eq(sessions.clinicId, clinicId),
    eq(sessions.roomId, roomId),
    eq(sessions.status, "ativa"),
    overlapsRange(sessions.scheduledStart, sessions.scheduledEnd, start, end),
  ];
  if (excludeSessionId) {
    conditions.push(ne(sessions.id, excludeSessionId));
  }
  const [row] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(...conditions))
    .limit(1);
  return row !== undefined;
}

async function hasActiveProfessionalConflict(
  tx: Tx,
  clinicId: string,
  professionalId: string,
  start: Date,
  end: Date,
  excludeSessionId?: string,
): Promise<boolean> {
  const conditions = [
    eq(sessions.clinicId, clinicId),
    eq(sessions.professionalId, professionalId),
    eq(sessions.status, "ativa"),
    overlapsRange(sessions.scheduledStart, sessions.scheduledEnd, start, end),
  ];
  if (excludeSessionId) {
    conditions.push(ne(sessions.id, excludeSessionId));
  }
  const [row] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(...conditions))
    .limit(1);
  return row !== undefined;
}

async function countActiveAttendees(tx: Tx, clinicId: string, sessionId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionAttendees)
    .where(
      and(
        eq(sessionAttendees.clinicId, clinicId),
        eq(sessionAttendees.sessionId, sessionId),
        ne(sessionAttendees.status, "cancelada"),
      ),
    );
  return row?.count ?? 0;
}

async function writeAuditLog(
  tx: Tx,
  clinicId: string,
  actor: Actor,
  action: string,
  entityType: "session" | "session_attendee",
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.insert(auditLog).values({
    clinicId,
    actorId: actor.type === "professional" ? (actor.professionalId ?? null) : null,
    actorType: actor.type,
    action,
    entityType,
    entityId,
    before: before as object | null,
    after: after as object | null,
  });
}

/**
 * Cancela o attendee e, se era o último ativo da session, cancela a session
 * também (ela deixa de bloquear sala/horário — ADR-0015). Mesma transação.
 */
async function cancelAttendeeAndMaybeSession(
  tx: Tx,
  clinicId: string,
  actor: Actor,
  current: SessionAttendee,
): Promise<SessionAttendee> {
  const [updatedRow] = await tx
    .update(sessionAttendees)
    .set({ status: "cancelada", updatedAt: new Date() })
    .where(and(eq(sessionAttendees.id, current.id), eq(sessionAttendees.clinicId, clinicId)))
    .returning();
  const updated = assertRow(updatedRow, "Update de status de participante não retornou linha");

  await writeAuditLog(
    tx,
    clinicId,
    actor,
    "session_attendee.status_changed",
    "session_attendee",
    updated.id,
    attendeeAuditSnapshot(current),
    attendeeAuditSnapshot(updated),
  );

  const remainingActive = await countActiveAttendees(tx, clinicId, current.sessionId);
  if (remainingActive === 0) {
    const sessionBefore = await fetchSession(tx, clinicId, current.sessionId);
    if (sessionBefore && sessionBefore.status === "ativa") {
      const [cancelledSessionRow] = await tx
        .update(sessions)
        .set({ status: "cancelada", updatedAt: new Date() })
        .where(and(eq(sessions.id, current.sessionId), eq(sessions.clinicId, clinicId)))
        .returning();
      const cancelledSession = assertRow(cancelledSessionRow, "Auto-cancelamento de session não retornou linha");

      await writeAuditLog(
        tx,
        clinicId,
        actor,
        "session.auto_cancelled",
        "session",
        cancelledSession.id,
        sessionAuditSnapshot(sessionBefore),
        sessionAuditSnapshot(cancelledSession),
      );
    }
  }

  return updated;
}

export function createSchedulingRepository(db: DbClient, clinicId: string): SchedulingRepository {
  return {
    async createSession(input, actor) {
      if (input.patientIds.length === 0) {
        throw new NoPatientsProvidedError();
      }
      const duplicates = findDuplicates(input.patientIds);
      if (duplicates.length > 0) {
        throw new DuplicatePatientIdsError(duplicates);
      }

      return withSerializableRetry(() =>
        db.transaction(
          async (tx) => {
            const room = await fetchRoom(tx, clinicId, input.roomId);
            if (!room) {
              throw new RoomNotFoundError(input.roomId);
            }

            const existingPatientIds = await fetchExistingPatientIds(tx, clinicId, input.patientIds);
            const missing = input.patientIds.filter((id) => !existingPatientIds.has(id));
            if (missing.length > 0) {
              throw new PatientNotFoundError(missing);
            }

            if (input.patientIds.length > room.capacity) {
              throw new RoomAtCapacityError(input.roomId);
            }

            if (await hasActiveRoomConflict(tx, clinicId, input.roomId, input.scheduledStart, input.scheduledEnd)) {
              throw new RoomConflictError(input.roomId);
            }
            if (
              await hasActiveProfessionalConflict(
                tx,
                clinicId,
                input.professionalId,
                input.scheduledStart,
                input.scheduledEnd,
              )
            ) {
              throw new ProfessionalConflictError(input.professionalId);
            }

            const [insertedSession] = await tx
              .insert(sessions)
              .values({
                clinicId,
                professionalId: input.professionalId,
                roomId: input.roomId,
                scheduledStart: input.scheduledStart,
                scheduledEnd: input.scheduledEnd,
                status: "ativa",
              })
              .returning();
            const session = assertRow(insertedSession, "Insert de session não retornou linha");

            const insertedAttendees = await tx
              .insert(sessionAttendees)
              .values(
                input.patientIds.map((patientId) => ({
                  clinicId,
                  sessionId: session.id,
                  patientId,
                  status: "agendada" as const,
                })),
              )
              .returning();

            await writeAuditLog(tx, clinicId, actor, "session.created", "session", session.id, null, {
              ...sessionAuditSnapshot(session),
              patientIds: input.patientIds,
            });

            return { session, attendees: insertedAttendees };
          },
          { isolationLevel: "serializable" },
        ),
      );
    },

    addAttendee(sessionId, patientId, actor) {
      return withSerializableRetry(() =>
        db.transaction(
          async (tx) => {
            const session = await fetchSession(tx, clinicId, sessionId);
            if (!session) {
              throw new SessionNotFoundError(sessionId);
            }
            if (session.status !== "ativa") {
              throw new SessionNotActiveError(sessionId);
            }

            const existingPatientIds = await fetchExistingPatientIds(tx, clinicId, [patientId]);
            if (!existingPatientIds.has(patientId)) {
              throw new PatientNotFoundError([patientId]);
            }

            const [existingAttendee] = await tx
              .select({ id: sessionAttendees.id })
              .from(sessionAttendees)
              .where(and(eq(sessionAttendees.sessionId, sessionId), eq(sessionAttendees.patientId, patientId)));
            if (existingAttendee) {
              throw new PatientAlreadyAttendingError(sessionId, patientId);
            }

            const room = await fetchRoom(tx, clinicId, session.roomId);
            if (!room) {
              throw new RoomNotFoundError(session.roomId);
            }

            const activeCount = await countActiveAttendees(tx, clinicId, sessionId);
            if (activeCount >= room.capacity) {
              throw new RoomAtCapacityError(session.roomId);
            }

            const [insertedRow] = await tx
              .insert(sessionAttendees)
              .values({ clinicId, sessionId, patientId, status: "agendada" })
              .returning();
            const attendee = assertRow(insertedRow, "Insert de participante não retornou linha");

            await writeAuditLog(
              tx,
              clinicId,
              actor,
              "session_attendee.added",
              "session_attendee",
              attendee.id,
              null,
              attendeeAuditSnapshot(attendee),
            );

            return attendee;
          },
          { isolationLevel: "serializable" },
        ),
      );
    },

    rescheduleSession(input, actor) {
      return withSerializableRetry(() =>
        db.transaction(
          async (tx) => {
            const current = await fetchSession(tx, clinicId, input.sessionId);
            if (!current) {
              throw new SessionNotFoundError(input.sessionId);
            }
            if (current.status !== "ativa") {
              throw new SessionNotActiveError(input.sessionId);
            }

            const room = await fetchRoom(tx, clinicId, input.roomId);
            if (!room) {
              throw new RoomNotFoundError(input.roomId);
            }

            if (
              await hasActiveRoomConflict(
                tx,
                clinicId,
                input.roomId,
                input.scheduledStart,
                input.scheduledEnd,
                input.sessionId,
              )
            ) {
              throw new RoomConflictError(input.roomId);
            }
            if (
              await hasActiveProfessionalConflict(
                tx,
                clinicId,
                current.professionalId,
                input.scheduledStart,
                input.scheduledEnd,
                input.sessionId,
              )
            ) {
              throw new ProfessionalConflictError(current.professionalId);
            }

            const [updatedRow] = await tx
              .update(sessions)
              .set({
                roomId: input.roomId,
                scheduledStart: input.scheduledStart,
                scheduledEnd: input.scheduledEnd,
                updatedAt: new Date(),
              })
              .where(and(eq(sessions.id, input.sessionId), eq(sessions.clinicId, clinicId)))
              .returning();
            const updated = assertRow(updatedRow, "Update de remarcação não retornou linha");

            await writeAuditLog(
              tx,
              clinicId,
              actor,
              "session.rescheduled",
              "session",
              updated.id,
              sessionAuditSnapshot(current),
              sessionAuditSnapshot(updated),
            );

            return updated;
          },
          { isolationLevel: "serializable" },
        ),
      );
    },

    updateAttendeeStatus(attendeeId, status, actor) {
      return withSerializableRetry(() =>
        db.transaction(
          async (tx) => {
            const current = await fetchAttendee(tx, clinicId, attendeeId);
            if (!current) {
              throw new SessionAttendeeNotFoundError(attendeeId);
            }

            const currentStatus = current.status as AttendeeStatus;
            if (!isValidStatusTransition(currentStatus, status)) {
              throw new InvalidStatusTransitionError(currentStatus, status);
            }

            if (status === "cancelada") {
              return cancelAttendeeAndMaybeSession(tx, clinicId, actor, current);
            }

            const [updatedRow] = await tx
              .update(sessionAttendees)
              .set({
                status,
                confirmedAt: status === "confirmada" ? new Date() : current.confirmedAt,
                updatedAt: new Date(),
              })
              .where(and(eq(sessionAttendees.id, attendeeId), eq(sessionAttendees.clinicId, clinicId)))
              .returning();
            const updated = assertRow(updatedRow, "Update de status de participante não retornou linha");

            await writeAuditLog(
              tx,
              clinicId,
              actor,
              "session_attendee.status_changed",
              "session_attendee",
              updated.id,
              attendeeAuditSnapshot(current),
              attendeeAuditSnapshot(updated),
            );

            return updated;
          },
          { isolationLevel: "serializable" },
        ),
      );
    },
  };
}
