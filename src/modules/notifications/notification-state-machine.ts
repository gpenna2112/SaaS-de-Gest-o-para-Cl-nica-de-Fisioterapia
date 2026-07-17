export type NotificationStatus = "pendente" | "enviada" | "entregue" | "falha" | "respondida" | "cancelada";

const ALLOWED_TRANSITIONS: Record<NotificationStatus, readonly NotificationStatus[]> = {
  pendente: ["enviada", "falha", "cancelada"],
  enviada: ["entregue", "falha", "respondida"],
  entregue: ["respondida"],
  falha: [],
  respondida: [],
  cancelada: [],
};

export function isValidNotificationStatusTransition(from: NotificationStatus, to: NotificationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Status de origem válidos para chegar a `target`. Usado pelo repositório
 * para montar o WHERE do compare-and-swap a partir da mesma tabela de
 * transições — uma única fonte de verdade, em vez de repetir a lista em
 * cada método do repositório.
 */
export function predecessorsOf(target: NotificationStatus): NotificationStatus[] {
  return (Object.keys(ALLOWED_TRANSITIONS) as NotificationStatus[]).filter((from) =>
    ALLOWED_TRANSITIONS[from].includes(target),
  );
}
