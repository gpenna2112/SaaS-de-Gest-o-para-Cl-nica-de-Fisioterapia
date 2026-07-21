import { and, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { isValidStatusTransition, type AttendeeStatus } from "@/modules/scheduling/session-state-machine";
import type { DbClient, QueryExecutor, Tx } from "../client";
import { auditLog, patients, rooms, sessionAttendees, sessions } from "../schema";
import { withSerializableRetry } from "../transaction-retry";
import {
  DuplicatePatientIdsError,
  InvalidStatusTransitionError,
  NoPatientsProvidedError,
  PatientAlreadyAttendingError,
  PatientInactiveError,
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

export interface AddAttendeeResult {
  session: Session;
  attendee: SessionAttendee;
}

export interface RescheduleSessionInput {
  sessionId: string;
  roomId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
}

export interface ListSessionsFilter {
  rangeStart: Date;
  rangeEnd: Date;
  roomId?: string;
  professionalId?: string;
}

export interface SessionWithAttendees extends Session {
  attendees: SessionAttendee[];
}

/**
 * Todo método aceita uma `tx` externa opcional (último parâmetro) para
 * composição atômica com outros repositórios (ex.: notifications) — ver
 * ADR-0016. Quando fornecida: o repositório a usa, nunca abre nem finaliza
 * transação própria, e nunca aplica retry (o chamador que abriu a `tx` é
 * quem decide a política de retry do conjunto). Quando omitida: comportamento
 * de sempre — abre a própria transação SERIALIZABLE com retry.
 */
export interface SchedulingRepository {
  createSession(input: CreateSessionInput, actor: Actor, tx?: Tx): Promise<CreateSessionResult>;
  addAttendee(sessionId: string, patientId: string, actor: Actor, tx?: Tx): Promise<AddAttendeeResult>;
  rescheduleSession(input: RescheduleSessionInput, actor: Actor, tx?: Tx): Promise<Session>;
  updateAttendeeStatus(attendeeId: string, status: AttendeeStatus, actor: Actor, tx?: Tx): Promise<SessionAttendee>;
  /**
   * Leitura simples, sem `SERIALIZABLE` — nenhuma decisão é tomada com base
   * no resultado, é só para exibição (agenda). Só `sessions` com
   * `status = 'ativa'`: cancelada nunca aparece na agenda, ela já não
   * bloqueia sala/horário (ADR-0015). `rangeStart`/`rangeEnd` são genéricos
   * (sobreposição de intervalo) — a rota é quem traduz "dia" em timezone da
   * clínica para esse range, este repositório não conhece conceito de dia.
   */
  listSessions(filter: ListSessionsFilter, tx?: Tx): Promise<SessionWithAttendees[]>;
  /**
   * Leitura simples de um attendee — usada pelo módulo `evolutions` (fora
   * deste módulo) para validar status (`realizada`) e resolver `patientId`
   * antes de gravar uma evolução clínica, sem que `evolutions` precise
   * conhecer a tabela `session_attendees` diretamente (ADR-0016: repositórios
   * de módulos diferentes compõem via chamadas públicas, nunca import direto
   * de tabela alheia).
   */
  getAttendee(attendeeId: string, tx?: Tx): Promise<SessionAttendee | null>;
  /**
   * Conta attendees com `status = 'cancelada'` no intervalo, independente do
   * `sessions.status` da turma. Necessário porque `listSessions` só retorna
   * `sessions.status = 'ativa'` (ADR-0015): quando o último attendee ativo é
   * cancelado, a session inteira vira `cancelada` e some de `listSessions` —
   * sem este método, uma turma cancelada por completo ficaria invisível para
   * qualquer contagem de "cancelamentos do dia".
   */
  countCancelledAttendees(filter: ListSessionsFilter, tx?: Tx): Promise<number>;
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

async function fetchAttendee(tx: QueryExecutor, clinicId: string, attendeeId: string) {
  const [attendee] = await tx
    .select()
    .from(sessionAttendees)
    .where(and(eq(sessionAttendees.id, attendeeId), eq(sessionAttendees.clinicId, clinicId)));
  return attendee;
}

/**
 * Mapa id → ativo para os patientIds encontrados nesta clínica. Um id
 * ausente do mapa não existe; presente com `false` existe mas está
 * desativado — paciente inativo não pode ser agendado (decisão de produto,
 * ver modules/patients/README.md).
 */
async function fetchPatientActiveStatus(tx: Tx, clinicId: string, patientIds: string[]): Promise<Map<string, boolean>> {
  const rows = await tx
    .select({ id: patients.id, active: patients.active })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), inArray(patients.id, patientIds)));
  return new Map(rows.map((row) => [row.id, row.active]));
}

function assertPatientsBookable(patientIds: string[], statusById: Map<string, boolean>): void {
  const missing = patientIds.filter((id) => !statusById.has(id));
  if (missing.length > 0) {
    throw new PatientNotFoundError(missing);
  }
  const inactive = patientIds.filter((id) => statusById.get(id) === false);
  if (inactive.length > 0) {
    throw new PatientInactiveError(inactive);
  }
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

async function createSessionCore(
  tx: Tx,
  clinicId: string,
  input: CreateSessionInput,
  actor: Actor,
): Promise<CreateSessionResult> {
  const room = await fetchRoom(tx, clinicId, input.roomId);
  if (!room) {
    throw new RoomNotFoundError(input.roomId);
  }

  const patientStatus = await fetchPatientActiveStatus(tx, clinicId, input.patientIds);
  assertPatientsBookable(input.patientIds, patientStatus);

  if (input.patientIds.length > room.capacity) {
    throw new RoomAtCapacityError(input.roomId);
  }

  if (await hasActiveRoomConflict(tx, clinicId, input.roomId, input.scheduledStart, input.scheduledEnd)) {
    throw new RoomConflictError(input.roomId);
  }
  if (
    await hasActiveProfessionalConflict(tx, clinicId, input.professionalId, input.scheduledStart, input.scheduledEnd)
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
}

async function addAttendeeCore(
  tx: Tx,
  clinicId: string,
  sessionId: string,
  patientId: string,
  actor: Actor,
): Promise<AddAttendeeResult> {
  const session = await fetchSession(tx, clinicId, sessionId);
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }
  if (session.status !== "ativa") {
    throw new SessionNotActiveError(sessionId);
  }

  const patientStatus = await fetchPatientActiveStatus(tx, clinicId, [patientId]);
  assertPatientsBookable([patientId], patientStatus);

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

  return { session, attendee };
}

async function rescheduleSessionCore(
  tx: Tx,
  clinicId: string,
  input: RescheduleSessionInput,
  actor: Actor,
): Promise<Session> {
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

  // Remarcar para uma sala menor não pode deixar participantes já ativos
  // sem vaga — mesma regra de capacidade que `addAttendee` já aplica.
  const activeAttendeeCount = await countActiveAttendees(tx, clinicId, input.sessionId);
  if (activeAttendeeCount > room.capacity) {
    throw new RoomAtCapacityError(input.roomId);
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
}

async function updateAttendeeStatusCore(
  tx: Tx,
  clinicId: string,
  attendeeId: string,
  status: AttendeeStatus,
  actor: Actor,
): Promise<SessionAttendee> {
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
}

export function createSchedulingRepository(db: DbClient, clinicId: string): SchedulingRepository {
  return {
    async createSession(input, actor, externalTx) {
      if (input.patientIds.length === 0) {
        throw new NoPatientsProvidedError();
      }
      const duplicates = findDuplicates(input.patientIds);
      if (duplicates.length > 0) {
        throw new DuplicatePatientIdsError(duplicates);
      }

      if (externalTx) {
        return createSessionCore(externalTx, clinicId, input, actor);
      }
      return withSerializableRetry(() =>
        db.transaction((tx) => createSessionCore(tx, clinicId, input, actor), { isolationLevel: "serializable" }),
      );
    },

    async addAttendee(sessionId, patientId, actor, externalTx) {
      if (externalTx) {
        return addAttendeeCore(externalTx, clinicId, sessionId, patientId, actor);
      }
      return withSerializableRetry(() =>
        db.transaction((tx) => addAttendeeCore(tx, clinicId, sessionId, patientId, actor), {
          isolationLevel: "serializable",
        }),
      );
    },

    async rescheduleSession(input, actor, externalTx) {
      if (externalTx) {
        return rescheduleSessionCore(externalTx, clinicId, input, actor);
      }
      return withSerializableRetry(() =>
        db.transaction((tx) => rescheduleSessionCore(tx, clinicId, input, actor), {
          isolationLevel: "serializable",
        }),
      );
    },

    async updateAttendeeStatus(attendeeId, status, actor, externalTx) {
      if (externalTx) {
        return updateAttendeeStatusCore(externalTx, clinicId, attendeeId, status, actor);
      }
      return withSerializableRetry(() =>
        db.transaction((tx) => updateAttendeeStatusCore(tx, clinicId, attendeeId, status, actor), {
          isolationLevel: "serializable",
        }),
      );
    },

    async listSessions(filter, tx) {
      const executor = tx ?? db;
      const conditions = [
        eq(sessions.clinicId, clinicId),
        eq(sessions.status, "ativa"),
        overlapsRange(sessions.scheduledStart, sessions.scheduledEnd, filter.rangeStart, filter.rangeEnd),
      ];
      if (filter.roomId) {
        conditions.push(eq(sessions.roomId, filter.roomId));
      }
      if (filter.professionalId) {
        conditions.push(eq(sessions.professionalId, filter.professionalId));
      }

      const sessionRows = await executor
        .select()
        .from(sessions)
        .where(and(...conditions));
      if (sessionRows.length === 0) {
        return [];
      }

      const sessionIds = sessionRows.map((session) => session.id);
      const attendeeRows = await executor
        .select()
        .from(sessionAttendees)
        .where(and(eq(sessionAttendees.clinicId, clinicId), inArray(sessionAttendees.sessionId, sessionIds)));

      const attendeesBySessionId = new Map<string, SessionAttendee[]>();
      for (const attendee of attendeeRows) {
        const list = attendeesBySessionId.get(attendee.sessionId) ?? [];
        list.push(attendee);
        attendeesBySessionId.set(attendee.sessionId, list);
      }

      return sessionRows.map((session) => ({
        ...session,
        attendees: attendeesBySessionId.get(session.id) ?? [],
      }));
    },

    async getAttendee(attendeeId, tx) {
      const executor = tx ?? db;
      const attendee = await fetchAttendee(executor, clinicId, attendeeId);
      return attendee ?? null;
    },

    async countCancelledAttendees(filter, tx) {
      const executor = tx ?? db;
      const conditions = [
        eq(sessionAttendees.clinicId, clinicId),
        eq(sessionAttendees.status, "cancelada"),
        overlapsRange(sessions.scheduledStart, sessions.scheduledEnd, filter.rangeStart, filter.rangeEnd),
      ];
      if (filter.roomId) {
        conditions.push(eq(sessions.roomId, filter.roomId));
      }
      if (filter.professionalId) {
        conditions.push(eq(sessions.professionalId, filter.professionalId));
      }

      const [row] = await executor
        .select({ count: sql<number>`count(*)::int` })
        .from(sessionAttendees)
        .innerJoin(sessions, eq(sessionAttendees.sessionId, sessions.id))
        .where(and(...conditions));
      return row?.count ?? 0;
    },
  };
}
