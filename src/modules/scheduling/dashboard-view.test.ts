import { describe, expect, it } from "vitest";
import { buildDashboardSnapshot, type DashboardProfessional, type DashboardRoom } from "./dashboard-view";
import { DAY_END_MINUTES, DAY_START_MINUTES } from "./day-range";
import type { SessionView } from "./session-view";

/** Constrói um instante de "2026-07-21" a partir de minutos desde a meia-noite (fuso -03:00). */
function atMinutes(minutes: number): Date {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(`2026-07-21T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
}

const ROOMS: DashboardRoom[] = [
  { id: "room-1", name: "Sala 1", capacity: 1 },
  { id: "room-2", name: "Sala 2", capacity: 1 },
  { id: "room-pilates", name: "Sala Pilates", capacity: 3 },
];
const PROFESSIONALS: DashboardProfessional[] = [
  { id: "prof-1", name: "Fernanda" },
  { id: "prof-2", name: "Sophia" },
];
const SLOT_MINUTES = 50;
const NOW = new Date("2026-07-21T09:15:00-03:00"); // 09:15 no fuso da clínica

function session(overrides: Partial<SessionView> & Pick<SessionView, "id" | "roomId" | "professionalId">): SessionView {
  return {
    scheduledStart: new Date("2026-07-21T09:00:00-03:00"),
    scheduledEnd: new Date("2026-07-21T09:50:00-03:00"),
    attendees: [],
    ...overrides,
  };
}

describe("buildDashboardSnapshot", () => {
  it("lista vazia: nenhuma sessão, todas as salas livres, sem próxima sessão", () => {
    const snapshot = buildDashboardSnapshot({
      sessions: [],
      rooms: ROOMS,
      professionals: PROFESSIONALS,
      now: NOW,
      slotMinutes: SLOT_MINUTES,
      cancelledCount: 0,
    });

    expect(snapshot.sessionsCount).toBe(0);
    expect(snapshot.attendingNow).toEqual([]);
    expect(snapshot.freeRoomsNow.map((r) => r.roomId).sort()).toEqual(["room-1", "room-2", "room-pilates"].sort());
    expect(snapshot.upcomingSessions).toEqual([]);
    expect(snapshot.awaitingConfirmation).toEqual([]);
  });

  it("sessão em andamento agora aparece em attendingNow e a sala some de freeRoomsNow", () => {
    const active = session({
      id: "s1",
      roomId: "room-1",
      professionalId: "prof-1",
      scheduledStart: new Date("2026-07-21T09:00:00-03:00"),
      scheduledEnd: new Date("2026-07-21T09:50:00-03:00"),
      attendees: [{ id: "a1", patientId: "p1", patientName: "Ana Souza", status: "confirmada" }],
    });

    const snapshot = buildDashboardSnapshot({
      sessions: [active],
      rooms: ROOMS,
      professionals: PROFESSIONALS,
      now: NOW,
      slotMinutes: SLOT_MINUTES,
      cancelledCount: 0,
    });

    expect(snapshot.attendingNow).toEqual([
      { roomId: "room-1", roomName: "Sala 1", professionalName: "Fernanda", patientNames: ["Ana Souza"], until: "09:50" },
    ]);
    expect(snapshot.freeRoomsNow.map((r) => r.roomId)).not.toContain("room-1");
    expect(snapshot.freeRoomsNow.map((r) => r.roomId).sort()).toEqual(["room-2", "room-pilates"].sort());
  });

  it("sessão futura entra em upcomingSessions ordenada por horário e cortada em 5", () => {
    const sessions: SessionView[] = Array.from({ length: 7 }, (_, index) =>
      session({
        id: `future-${index}`,
        roomId: "room-2",
        professionalId: "prof-2",
        scheduledStart: new Date(`2026-07-21T${10 + index}:00:00-03:00`),
        scheduledEnd: new Date(`2026-07-21T${10 + index}:50:00-03:00`),
        attendees: [{ id: `att-${index}`, patientId: `p${index}`, patientName: `Paciente ${index}`, status: "agendada" }],
      }),
    );

    const snapshot = buildDashboardSnapshot({
      sessions,
      rooms: ROOMS,
      professionals: PROFESSIONALS,
      now: NOW,
      slotMinutes: SLOT_MINUTES,
      cancelledCount: 0,
    });

    expect(snapshot.upcomingSessions).toHaveLength(5);
    expect(snapshot.upcomingSessions[0]!.time).toBe("10:00");
    expect(snapshot.upcomingSessions.map((s) => s.time)).toEqual(["10:00", "11:00", "12:00", "13:00", "14:00"]);
  });

  it("Pilates com múltiplos attendees: cada status contado corretamente, cancelado some das listas de pacientes", () => {
    const pilates = session({
      id: "pilates-1",
      roomId: "room-pilates",
      professionalId: "prof-1",
      scheduledStart: new Date("2026-07-21T09:00:00-03:00"),
      scheduledEnd: new Date("2026-07-21T09:50:00-03:00"),
      attendees: [
        { id: "a1", patientId: "p1", patientName: "Ana", status: "realizada" },
        { id: "a2", patientId: "p2", patientName: "Bruno", status: "falta" },
        { id: "a3", patientId: "p3", patientName: "Carla", status: "cancelada" },
        { id: "a4", patientId: "p4", patientName: null, status: "agendada" },
      ],
    });

    const snapshot = buildDashboardSnapshot({
      sessions: [pilates],
      rooms: ROOMS,
      professionals: PROFESSIONALS,
      now: NOW,
      slotMinutes: SLOT_MINUTES,
      cancelledCount: 2,
    });

    expect(snapshot.realizedCount).toBe(1);
    expect(snapshot.missedCount).toBe(1);
    expect(snapshot.cancelledCount).toBe(2); // vem do parâmetro, não recomputado
    expect(snapshot.attendingNow[0]!.patientNames).toEqual(["Ana", "Bruno", "Paciente"]); // cancelada some, nome nulo vira "Paciente"
    expect(snapshot.awaitingConfirmation).toEqual([
      {
        attendeeId: "a4",
        time: "09:00",
        roomName: "Sala Pilates",
        professionalName: "Fernanda",
        patientName: "Paciente",
      },
    ]);
  });

  it("próximo horário livre: sala lotada o dia inteiro retorna null, sala livre retorna o slot que contém agora", () => {
    const slotCount = Math.ceil((DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_MINUTES);
    const fullDaySessions: SessionView[] = Array.from({ length: slotCount }, (_, index) => {
      const slotStart = DAY_START_MINUTES + index * SLOT_MINUTES;
      return session({
        id: `full-${index}`,
        roomId: "room-1",
        professionalId: "prof-1",
        scheduledStart: atMinutes(slotStart),
        scheduledEnd: atMinutes(slotStart + SLOT_MINUTES),
        attendees: [{ id: `a-${index}`, patientId: "p", patientName: "X", status: "agendada" }],
      });
    });

    const snapshot = buildDashboardSnapshot({
      sessions: fullDaySessions,
      rooms: ROOMS,
      professionals: PROFESSIONALS,
      now: NOW,
      slotMinutes: SLOT_MINUTES,
      cancelledCount: 0,
    });

    const room1 = snapshot.nextFreeSlotByRoom.find((entry) => entry.roomId === "room-1");
    const room2 = snapshot.nextFreeSlotByRoom.find((entry) => entry.roomId === "room-2");
    expect(room1?.time).toBeNull();
    // NOW = 09:15 cai no slot 08:40–09:30 (ainda não terminou) — sala livre reporta esse slot.
    expect(room2?.time).toBe("08:40");
  });
});
