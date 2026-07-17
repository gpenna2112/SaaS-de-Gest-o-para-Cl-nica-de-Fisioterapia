import type {
  Actor,
  AddAttendeeResult,
  CreateSessionInput,
  CreateSessionResult,
  RescheduleSessionInput,
  SchedulingRepository,
  Session,
  SessionAttendee,
} from "@/db/repositories/scheduling-repository";
import type { NotificationsRepository } from "@/db/repositories/notifications-repository";
import type { DbClient } from "@/db/client";
import { withSerializableRetry } from "@/db/transaction-retry";
import { computeConfirmationScheduledFor } from "@/modules/notifications/scheduled-for";
import type { AttendeeStatus } from "./session-state-machine";

/**
 * Orquestra scheduling + notifications numa única transação SERIALIZABLE:
 * criar/adicionar sessão e agendar a confirmação são atômicos (ADR-0016) —
 * ou os dois acontecem, ou nenhum. Canal fixo em `whatsapp_cloud_api` por
 * ora (ver plano do módulo notifications, §10 — simplificação assumida).
 */
const DEFAULT_CHANNEL = "whatsapp_cloud_api" as const;

export interface SchedulingService {
  createSession(input: CreateSessionInput, actor: Actor): Promise<CreateSessionResult>;
  addAttendee(sessionId: string, patientId: string, actor: Actor): Promise<AddAttendeeResult>;
  rescheduleSession(input: RescheduleSessionInput, actor: Actor): Promise<Session>;
  updateAttendeeStatus(attendeeId: string, status: AttendeeStatus, actor: Actor): Promise<SessionAttendee>;
}

export function createSchedulingService(
  db: DbClient,
  schedulingRepository: SchedulingRepository,
  notificationsRepository: NotificationsRepository,
): SchedulingService {
  return {
    createSession(input, actor) {
      return withSerializableRetry(() =>
        db.transaction(
          async (tx) => {
            const result = await schedulingRepository.createSession(input, actor, tx);
            const scheduledFor = computeConfirmationScheduledFor(result.session.scheduledStart);
            for (const attendee of result.attendees) {
              await notificationsRepository.createConfirmation(
                { sessionAttendeeId: attendee.id, channel: DEFAULT_CHANNEL, scheduledFor },
                tx,
              );
            }
            return result;
          },
          { isolationLevel: "serializable" },
        ),
      );
    },

    addAttendee(sessionId, patientId, actor) {
      return withSerializableRetry(() =>
        db.transaction(
          async (tx) => {
            const result = await schedulingRepository.addAttendee(sessionId, patientId, actor, tx);
            const scheduledFor = computeConfirmationScheduledFor(result.session.scheduledStart);
            await notificationsRepository.createConfirmation(
              { sessionAttendeeId: result.attendee.id, channel: DEFAULT_CHANNEL, scheduledFor },
              tx,
            );
            return result;
          },
          { isolationLevel: "serializable" },
        ),
      );
    },

    rescheduleSession(input, actor) {
      return withSerializableRetry(() =>
        db.transaction(
          async (tx) => {
            const session = await schedulingRepository.rescheduleSession(input, actor, tx);
            // Só reagenda confirmações ainda pendentes — quem já respondeu,
            // já foi notificado ou já cancelou não é reaberto (regra
            // confirmada explicitamente, não a mesma coisa que "resetar
            // status do attendee", que o ADR-0015 deixou de fora do escopo).
            const scheduledFor = computeConfirmationScheduledFor(session.scheduledStart);
            await notificationsRepository.rescheduleConfirmationsForSession(session.id, scheduledFor, tx);
            return session;
          },
          { isolationLevel: "serializable" },
        ),
      );
    },

    updateAttendeeStatus(attendeeId, status, actor) {
      return withSerializableRetry(() =>
        db.transaction(
          async (tx) => {
            const attendee = await schedulingRepository.updateAttendeeStatus(attendeeId, status, actor, tx);
            if (status === "cancelada") {
              await notificationsRepository.cancelPendingForAttendee(attendeeId, tx);
            }
            return attendee;
          },
          { isolationLevel: "serializable" },
        ),
      );
    },
  };
}
