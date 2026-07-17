import { and, eq, inArray } from "drizzle-orm";
import { predecessorsOf, type NotificationStatus } from "@/modules/notifications/notification-state-machine";
import type { DbClient, QueryExecutor, Tx } from "../client";
import { notifications, patients, sessionAttendees } from "../schema";
import { InvalidNotificationStatusTransitionError, NotificationNotFoundError } from "./notifications-repository.errors";

export type Notification = typeof notifications.$inferSelect;
export type NotificationChannel = "whatsapp_cloud_api" | "manual_fallback";

export interface CreateConfirmationInput {
  sessionAttendeeId: string;
  channel: NotificationChannel;
  scheduledFor: Date;
}

/**
 * Todo método aceita opcionalmente uma `Tx` já aberta, para composição
 * atômica com outros repositórios (ver scheduling-service.ts, ADR-0016).
 * Ao contrário de scheduling-repository, nenhum método aqui precisa de
 * SERIALIZABLE/retry próprio: cada operação é uma única instrução atômica
 * (INSERT protegido por UNIQUE, ou UPDATE condicional/compare-and-swap) —
 * não há padrão "ler N linhas, validar, escrever" que precise de SSI.
 */
export interface NotificationsRepository {
  createConfirmation(input: CreateConfirmationInput, tx?: Tx): Promise<Notification | null>;
  rescheduleConfirmationsForSession(sessionId: string, scheduledFor: Date, tx?: Tx): Promise<void>;
  cancelPendingForAttendee(sessionAttendeeId: string, tx?: Tx): Promise<void>;
  markSent(notificationId: string, tx?: Tx): Promise<Notification>;
  markDelivered(notificationId: string, tx?: Tx): Promise<Notification>;
  markFailed(notificationId: string, reason: string, tx?: Tx): Promise<Notification>;
  recordResponse(notificationId: string, response: "confirmado" | "cancelado", tx?: Tx): Promise<Notification>;
}

const CONFIRMATION_TEMPLATE = "session_confirmation";

function assertRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }
  return row;
}

/**
 * Compare-and-swap genérico: só aplica `set` se o status atual estiver entre
 * `validFromStatuses` (derivados da máquina de estados, nunca hardcoded
 * duas vezes). 0 linhas afetadas → distingue "não existe" de "estado
 * inesperado" com uma segunda consulta, só nesse caminho de erro.
 */
async function transitionNotification(
  executor: QueryExecutor,
  clinicId: string,
  notificationId: string,
  toStatus: NotificationStatus,
  extraSet: Record<string, unknown>,
): Promise<Notification> {
  const validFromStatuses = predecessorsOf(toStatus);

  const [row] = await executor
    .update(notifications)
    .set({ status: toStatus, ...extraSet })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.clinicId, clinicId),
        inArray(notifications.status, validFromStatuses),
      ),
    )
    .returning();
  if (row) {
    return row;
  }

  const [existing] = await executor
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.clinicId, clinicId)));
  if (!existing) {
    throw new NotificationNotFoundError(notificationId);
  }
  throw new InvalidNotificationStatusTransitionError(existing.status as NotificationStatus, toStatus);
}

export function createNotificationsRepository(db: DbClient, clinicId: string): NotificationsRepository {
  return {
    async createConfirmation(input, tx) {
      const executor = tx ?? db;

      // Sem telefone, F2 não pode disparar automaticamente — não é erro,
      // é um "sem-op" legítimo (decisão já registrada na modelagem de patients).
      const [attendeeWithPhone] = await executor
        .select({ phone: patients.phone })
        .from(sessionAttendees)
        .innerJoin(patients, eq(patients.id, sessionAttendees.patientId))
        .where(and(eq(sessionAttendees.id, input.sessionAttendeeId), eq(sessionAttendees.clinicId, clinicId)));

      if (!attendeeWithPhone || !attendeeWithPhone.phone) {
        return null;
      }

      const [inserted] = await executor
        .insert(notifications)
        .values({
          clinicId,
          sessionAttendeeId: input.sessionAttendeeId,
          channel: input.channel,
          template: CONFIRMATION_TEMPLATE,
          status: "pendente",
          scheduledFor: input.scheduledFor,
        })
        .returning();
      return assertRow(inserted, "Insert de confirmação não retornou linha");
    },

    async rescheduleConfirmationsForSession(sessionId, scheduledFor, tx) {
      const executor = tx ?? db;
      const attendeeIdsForSession = executor
        .select({ id: sessionAttendees.id })
        .from(sessionAttendees)
        .where(and(eq(sessionAttendees.clinicId, clinicId), eq(sessionAttendees.sessionId, sessionId)));

      await executor
        .update(notifications)
        .set({ scheduledFor })
        .where(
          and(
            eq(notifications.clinicId, clinicId),
            eq(notifications.status, "pendente"),
            inArray(notifications.sessionAttendeeId, attendeeIdsForSession),
          ),
        );
    },

    async cancelPendingForAttendee(sessionAttendeeId, tx) {
      const executor = tx ?? db;
      await executor
        .update(notifications)
        .set({ status: "cancelada" })
        .where(
          and(
            eq(notifications.clinicId, clinicId),
            eq(notifications.sessionAttendeeId, sessionAttendeeId),
            eq(notifications.status, "pendente"),
          ),
        );
    },

    markSent(notificationId, tx) {
      return transitionNotification(tx ?? db, clinicId, notificationId, "enviada", { sentAt: new Date() });
    },

    markDelivered(notificationId, tx) {
      return transitionNotification(tx ?? db, clinicId, notificationId, "entregue", {});
    },

    markFailed(notificationId, reason, tx) {
      return transitionNotification(tx ?? db, clinicId, notificationId, "falha", { failureReason: reason });
    },

    recordResponse(notificationId, response, tx) {
      return transitionNotification(tx ?? db, clinicId, notificationId, "respondida", {
        response,
        respondedAt: new Date(),
      });
    },
  };
}
