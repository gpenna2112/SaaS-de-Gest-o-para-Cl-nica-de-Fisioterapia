/**
 * Status de um `session_attendee` (participante de uma sessão) — não da
 * `session` em si, que só tem `ativa`/`cancelada` (ver src/db/schema/sessions.ts).
 */
export type AttendeeStatus = "agendada" | "confirmada" | "realizada" | "falta" | "cancelada";

const ALLOWED_TRANSITIONS: Record<AttendeeStatus, readonly AttendeeStatus[]> = {
  agendada: ["confirmada", "realizada", "falta", "cancelada"],
  confirmada: ["realizada", "falta", "cancelada"],
  realizada: [],
  falta: [],
  cancelada: [],
};

export function isValidStatusTransition(from: AttendeeStatus, to: AttendeeStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Rótulo em pt-BR de cada status de attendee — única fonte, reutilizada pela
 * agenda, pelo painel de sessão e pelo histórico do paciente. */
export const ATTENDEE_STATUS_LABELS: Record<AttendeeStatus, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  falta: "Falta",
  cancelada: "Cancelada",
};

/** Tom visual (`StatusBadge`) de cada status de attendee — mesma fonte única. */
export const ATTENDEE_STATUS_TONES: Record<AttendeeStatus, "neutral" | "success" | "warning" | "danger"> = {
  agendada: "neutral",
  confirmada: "success",
  realizada: "success",
  falta: "danger",
  cancelada: "neutral",
};
