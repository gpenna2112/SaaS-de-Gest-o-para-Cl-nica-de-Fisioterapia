import type { SessionWithAttendees } from "@/db/repositories/scheduling-repository";

export interface SessionAttendeeView {
  id: string;
  patientId: string;
  patientName: string | null;
  status: string;
}

export interface SessionView {
  id: string;
  professionalId: string;
  roomId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  attendees: SessionAttendeeView[];
}

/**
 * `scheduling-repository` não conhece `patients` (limite de módulo) — quem
 * chama resolve o nome de cada attendee compondo os dois repositórios.
 * Compartilhado entre `GET /api/v1/sessions` e a página `/agenda` (leitura
 * direta via repositório) para não duplicar essa composição duas vezes.
 */
export function toSessionViews(
  sessions: SessionWithAttendees[],
  patientNameById: ReadonlyMap<string, string>,
): SessionView[] {
  return sessions.map((session) => ({
    id: session.id,
    professionalId: session.professionalId,
    roomId: session.roomId,
    scheduledStart: session.scheduledStart,
    scheduledEnd: session.scheduledEnd,
    attendees: session.attendees.map((attendee) => ({
      id: attendee.id,
      patientId: attendee.patientId,
      patientName: patientNameById.get(attendee.patientId) ?? null,
      status: attendee.status,
    })),
  }));
}
