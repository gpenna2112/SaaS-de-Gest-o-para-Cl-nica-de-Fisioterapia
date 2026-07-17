import type { NotificationStatus } from "@/modules/notifications/notification-state-machine";

export class NotificationNotFoundError extends Error {
  constructor(public readonly notificationId: string) {
    super(`Notificação ${notificationId} não encontrada.`);
    this.name = "NotificationNotFoundError";
  }
}

/**
 * A transição pedida não é válida a partir do status atual — inclui o caso
 * de compare-and-swap perder a corrida (outro processo já mudou o status).
 * Não distinguimos os dois casos por design: ambos significam "a notificação
 * não está mais no estado que você esperava", e o chamador deve reagir da
 * mesma forma (reconsultar, não tentar de novo às cegas).
 */
export class InvalidNotificationStatusTransitionError extends Error {
  constructor(
    public readonly from: NotificationStatus,
    public readonly to: NotificationStatus,
  ) {
    super(`Transição de status de notificação inválida: ${from} → ${to}.`);
    this.name = "InvalidNotificationStatusTransitionError";
  }
}
