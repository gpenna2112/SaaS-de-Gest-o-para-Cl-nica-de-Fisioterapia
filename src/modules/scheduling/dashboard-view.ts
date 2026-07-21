import {
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  formatMinutesAsTime,
  minutesSinceMidnightSaoPaulo,
} from "./day-range";
import type { SessionView } from "./session-view";

/**
 * Função pura (ADR-0001 — lógica de domínio fora do framework) que resume o
 * dia da clínica pro dashboard. Recebe exatamente os mesmos dados que
 * `/agenda` já busca (sessões do dia via `listSessions`, salas, profissionais),
 * sem nenhuma query nova — só reorganiza o que já existe sob outro ângulo.
 */

export interface DashboardRoom {
  id: string;
  name: string;
  capacity: number;
}

export interface DashboardProfessional {
  id: string;
  name: string;
}

export interface AttendingNowEntry {
  roomId: string;
  roomName: string;
  professionalName: string;
  patientNames: string[];
  until: string;
}

export interface FreeRoomEntry {
  roomId: string;
  roomName: string;
}

export interface UpcomingSessionEntry {
  sessionId: string;
  time: string;
  roomName: string;
  professionalName: string;
  patientNames: string[];
}

export interface AwaitingConfirmationEntry {
  attendeeId: string;
  time: string;
  roomName: string;
  professionalName: string;
  patientName: string;
}

export interface NextFreeSlotEntry {
  roomId: string;
  roomName: string;
  /** `null` = nenhum horário livre restante hoje nessa sala. */
  time: string | null;
}

export interface DashboardSnapshot {
  sessionsCount: number;
  realizedCount: number;
  missedCount: number;
  cancelledCount: number;
  attendingNow: AttendingNowEntry[];
  freeRoomsNow: FreeRoomEntry[];
  upcomingSessions: UpcomingSessionEntry[];
  awaitingConfirmation: AwaitingConfirmationEntry[];
  nextFreeSlotByRoom: NextFreeSlotEntry[];
}

export function buildDashboardSnapshot({
  sessions,
  rooms,
  professionals,
  now,
  slotMinutes,
  cancelledCount,
}: {
  sessions: SessionView[];
  rooms: DashboardRoom[];
  professionals: DashboardProfessional[];
  now: Date;
  slotMinutes: number;
  /** Contagem de attendees cancelados no dia — vem do servidor (mesma razão
   * documentada em `countCancelledAttendees`: uma turma cancelada por
   * completo já não aparece em `sessions`). */
  cancelledCount: number;
}): DashboardSnapshot {
  const professionalNameById = new Map(professionals.map((professional) => [professional.id, professional.name]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const nowMinutes = minutesSinceMidnightSaoPaulo(now);

  const allAttendees = sessions.flatMap((session) => session.attendees);
  const realizedCount = allAttendees.filter((attendee) => attendee.status === "realizada").length;
  const missedCount = allAttendees.filter((attendee) => attendee.status === "falta").length;

  const activeNowSessions = sessions.filter((session) => {
    const start = minutesSinceMidnightSaoPaulo(session.scheduledStart);
    const end = minutesSinceMidnightSaoPaulo(session.scheduledEnd);
    return nowMinutes >= start && nowMinutes < end;
  });
  const occupiedRoomIdsNow = new Set(activeNowSessions.map((session) => session.roomId));

  const attendingNow: AttendingNowEntry[] = activeNowSessions.map((session) => ({
    roomId: session.roomId,
    roomName: roomById.get(session.roomId)?.name ?? "—",
    professionalName: professionalNameById.get(session.professionalId) ?? "—",
    patientNames: session.attendees
      .filter((attendee) => attendee.status !== "cancelada")
      .map((attendee) => attendee.patientName ?? "Paciente"),
    until: formatMinutesAsTime(minutesSinceMidnightSaoPaulo(session.scheduledEnd)),
  }));

  const freeRoomsNow: FreeRoomEntry[] = rooms
    .filter((room) => !occupiedRoomIdsNow.has(room.id))
    .map((room) => ({ roomId: room.id, roomName: room.name }));

  const upcomingSessions: UpcomingSessionEntry[] = sessions
    .filter((session) => minutesSinceMidnightSaoPaulo(session.scheduledStart) > nowMinutes)
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())
    .slice(0, 5)
    .map((session) => ({
      sessionId: session.id,
      time: formatMinutesAsTime(minutesSinceMidnightSaoPaulo(session.scheduledStart)),
      roomName: roomById.get(session.roomId)?.name ?? "—",
      professionalName: professionalNameById.get(session.professionalId) ?? "—",
      patientNames: session.attendees
        .filter((attendee) => attendee.status !== "cancelada")
        .map((attendee) => attendee.patientName ?? "Paciente"),
    }));

  const pendingPairs = sessions.flatMap((session) =>
    session.attendees
      .filter((attendee) => attendee.status === "agendada")
      .map((attendee) => ({ session, attendee })),
  );
  pendingPairs.sort((a, b) => a.session.scheduledStart.getTime() - b.session.scheduledStart.getTime());
  const awaitingConfirmation: AwaitingConfirmationEntry[] = pendingPairs.map(({ session, attendee }) => ({
    attendeeId: attendee.id,
    time: formatMinutesAsTime(minutesSinceMidnightSaoPaulo(session.scheduledStart)),
    roomName: roomById.get(session.roomId)?.name ?? "—",
    professionalName: professionalNameById.get(session.professionalId) ?? "—",
    patientName: attendee.patientName ?? "Paciente",
  }));

  const slotCount = Math.ceil((DAY_END_MINUTES - DAY_START_MINUTES) / slotMinutes);
  const occupiedSlotsByRoom = new Map<string, Set<number>>();
  for (const session of sessions) {
    const startMinutes = minutesSinceMidnightSaoPaulo(session.scheduledStart);
    const endMinutes = minutesSinceMidnightSaoPaulo(session.scheduledEnd);
    const startIndex = Math.floor((startMinutes - DAY_START_MINUTES) / slotMinutes);
    const span = Math.max(1, Math.ceil((endMinutes - startMinutes) / slotMinutes));
    const occupied = occupiedSlotsByRoom.get(session.roomId) ?? new Set<number>();
    for (let index = startIndex; index < startIndex + span; index++) occupied.add(index);
    occupiedSlotsByRoom.set(session.roomId, occupied);
  }

  const nextFreeSlotByRoom: NextFreeSlotEntry[] = rooms.map((room) => {
    const occupied = occupiedSlotsByRoom.get(room.id);
    for (let index = 0; index < slotCount; index++) {
      const slotStart = DAY_START_MINUTES + index * slotMinutes;
      const slotEnd = slotStart + slotMinutes;
      if (slotEnd <= nowMinutes) continue; // slot já passou por completo
      if (occupied?.has(index)) continue;
      return { roomId: room.id, roomName: room.name, time: formatMinutesAsTime(slotStart) };
    }
    return { roomId: room.id, roomName: room.name, time: null };
  });

  return {
    sessionsCount: sessions.length,
    realizedCount,
    missedCount,
    cancelledCount,
    attendingNow,
    freeRoomsNow,
    upcomingSessions,
    awaitingConfirmation,
    nextFreeSlotByRoom,
  };
}
