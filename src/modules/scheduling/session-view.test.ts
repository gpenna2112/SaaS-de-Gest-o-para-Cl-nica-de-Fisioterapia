import { describe, expect, it } from "vitest";
import { toSessionViews } from "./session-view";

describe("toSessionViews", () => {
  it("resolve o nome de cada attendee a partir do mapa de pacientes", () => {
    const sessions = [
      {
        id: "session-1",
        clinicId: "clinic-1",
        professionalId: "prof-1",
        roomId: "room-1",
        scheduledStart: new Date("2026-07-20T13:00:00-03:00"),
        scheduledEnd: new Date("2026-07-20T13:50:00-03:00"),
        status: "ativa" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        attendees: [
          {
            id: "att-1",
            clinicId: "clinic-1",
            sessionId: "session-1",
            patientId: "patient-1",
            status: "agendada",
            confirmedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ];

    const result = toSessionViews(sessions, new Map([["patient-1", "Ana"]]));

    expect(result).toEqual([
      {
        id: "session-1",
        professionalId: "prof-1",
        roomId: "room-1",
        scheduledStart: sessions[0]!.scheduledStart,
        scheduledEnd: sessions[0]!.scheduledEnd,
        attendees: [
          {
            id: "att-1",
            patientId: "patient-1",
            patientName: "Ana",
            status: "agendada",
          },
        ],
      },
    ]);
  });

  it("patientName vira null quando o paciente não está no mapa", () => {
    const sessions = [
      {
        id: "session-1",
        clinicId: "clinic-1",
        professionalId: "prof-1",
        roomId: "room-1",
        scheduledStart: new Date(),
        scheduledEnd: new Date(),
        status: "ativa" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        attendees: [
          {
            id: "att-1",
            clinicId: "clinic-1",
            sessionId: "session-1",
            patientId: "patient-desconhecido",
            status: "agendada",
            confirmedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ];

    const result = toSessionViews(sessions, new Map());

    expect(result[0]!.attendees[0]!.patientName).toBeNull();
  });

  it("lista vazia retorna lista vazia", () => {
    expect(toSessionViews([], new Map())).toEqual([]);
  });
});
