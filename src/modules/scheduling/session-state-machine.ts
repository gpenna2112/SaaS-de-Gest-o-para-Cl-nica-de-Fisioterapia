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
