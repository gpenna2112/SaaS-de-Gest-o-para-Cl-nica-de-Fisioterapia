import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "@/modules/auth/authorization";
import {
  PatientInactiveError,
  RoomAtCapacityError,
  RoomConflictError,
  RoomNotFoundError,
} from "@/db/repositories/scheduling-repository.errors";

vi.mock("@/modules/auth/session", () => ({
  requireSessionUser: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/scheduling-repository", () => ({
  createSchedulingRepository: vi.fn(),
}));
vi.mock("@/db/repositories/patients-repository", () => ({
  createPatientsRepository: vi.fn(),
}));
vi.mock("@/db/repositories/notifications-repository", () => ({
  createNotificationsRepository: vi.fn(),
}));
vi.mock("@/modules/scheduling/scheduling-service", () => ({
  createSchedulingService: vi.fn(),
}));

import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { requireSessionUser } from "@/modules/auth/session";
import { createSchedulingService } from "@/modules/scheduling/scheduling-service";
import { GET, POST } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

const VALID_PROFESSIONAL_ID = randomUUID();
const VALID_ROOM_ID = randomUUID();
const VALID_PATIENT_ID = randomUUID();

function createSessionRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validCreateSessionBody(overrides: Record<string, unknown> = {}) {
  return {
    professionalId: VALID_PROFESSIONAL_ID,
    roomId: VALID_ROOM_ID,
    scheduledStart: "2026-07-20T13:00:00-03:00",
    scheduledEnd: "2026-07-20T13:50:00-03:00",
    patientIds: [VALID_PATIENT_ID],
    ...overrides,
  };
}

describe("GET /api/v1/sessions", () => {
  it("retorna sessões do dia com nomes de pacientes resolvidos", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const listSessions = vi.fn().mockResolvedValue([
      {
        id: "session-1",
        professionalId: "prof-1",
        roomId: "room-1",
        scheduledStart: new Date("2026-07-20T13:00:00-03:00"),
        scheduledEnd: new Date("2026-07-20T13:50:00-03:00"),
        attendees: [
          { id: "att-1", patientId: "patient-1", status: "agendada" },
        ],
      },
    ]);
    vi.mocked(createSchedulingRepository).mockReturnValue({
      listSessions,
    } as never);
    const listPatients = vi
      .fn()
      .mockResolvedValue([{ id: "patient-1", name: "Ana" }]);
    vi.mocked(createPatientsRepository).mockReturnValue({
      listPatients,
    } as never);

    const response = await GET(
      new Request("http://localhost/api/v1/sessions?date=2026-07-20"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].attendees[0]).toEqual({
      id: "att-1",
      patientId: "patient-1",
      patientName: "Ana",
      status: "agendada",
    });
  });

  it("resolve patientName como null quando o paciente não é encontrado", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const listSessions = vi.fn().mockResolvedValue([
      {
        id: "session-1",
        professionalId: "prof-1",
        roomId: "room-1",
        scheduledStart: new Date("2026-07-20T13:00:00-03:00"),
        scheduledEnd: new Date("2026-07-20T13:50:00-03:00"),
        attendees: [
          {
            id: "att-1",
            patientId: "patient-desconhecido",
            status: "agendada",
          },
        ],
      },
    ]);
    vi.mocked(createSchedulingRepository).mockReturnValue({
      listSessions,
    } as never);
    vi.mocked(createPatientsRepository).mockReturnValue({
      listPatients: vi.fn().mockResolvedValue([]),
    } as never);

    const response = await GET(
      new Request("http://localhost/api/v1/sessions?date=2026-07-20"),
    );

    const body = await response.json();
    expect(body.sessions[0].attendees[0].patientName).toBeNull();
  });

  it("retorna 400 quando 'date' está ausente", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await GET(new Request("http://localhost/api/v1/sessions"));

    expect(response.status).toBe(400);
  });

  it("retorna 400 quando 'date' tem formato inválido", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await GET(
      new Request("http://localhost/api/v1/sessions?date=20-07-2026"),
    );

    expect(response.status).toBe(400);
  });

  it("repassa roomId/professionalId da query string para o repositório", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const listSessions = vi.fn().mockResolvedValue([]);
    vi.mocked(createSchedulingRepository).mockReturnValue({
      listSessions,
    } as never);
    vi.mocked(createPatientsRepository).mockReturnValue({
      listPatients: vi.fn().mockResolvedValue([]),
    } as never);

    await GET(
      new Request(
        "http://localhost/api/v1/sessions?date=2026-07-20&roomId=room-1&professionalId=prof-2",
      ),
    );

    expect(listSessions).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: "room-1", professionalId: "prof-2" }),
    );
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await GET(
      new Request("http://localhost/api/v1/sessions?date=2026-07-20"),
    );

    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/sessions", () => {
  it("cria a sessão e retorna 201", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const createSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-1",
        professionalId: VALID_PROFESSIONAL_ID,
        roomId: VALID_ROOM_ID,
        scheduledStart: new Date("2026-07-20T13:00:00-03:00"),
        scheduledEnd: new Date("2026-07-20T13:50:00-03:00"),
      },
      attendees: [
        { id: "att-1", patientId: VALID_PATIENT_ID, status: "agendada" },
      ],
    });
    vi.mocked(createSchedulingService).mockReturnValue({
      createSession,
    } as never);

    const response = await POST(createSessionRequest(validCreateSessionBody()));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.session.id).toBe("session-1");
    expect(body.attendees).toEqual([
      { id: "att-1", patientId: VALID_PATIENT_ID, status: "agendada" },
    ]);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        professionalId: VALID_PROFESSIONAL_ID,
        roomId: VALID_ROOM_ID,
      }),
      { type: "professional", professionalId: "prof-1" },
    );
  });

  it("retorna 400 quando patientIds está vazio", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await POST(
      createSessionRequest(validCreateSessionBody({ patientIds: [] })),
    );

    expect(response.status).toBe(400);
  });

  it("retorna 404 quando a sala não existe", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const createSession = vi
      .fn()
      .mockRejectedValue(new RoomNotFoundError(VALID_ROOM_ID));
    vi.mocked(createSchedulingService).mockReturnValue({
      createSession,
    } as never);

    const response = await POST(createSessionRequest(validCreateSessionBody()));

    expect(response.status).toBe(404);
  });

  it("retorna 409 quando há conflito de sala", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const createSession = vi
      .fn()
      .mockRejectedValue(new RoomConflictError(VALID_ROOM_ID));
    vi.mocked(createSchedulingService).mockReturnValue({
      createSession,
    } as never);

    const response = await POST(createSessionRequest(validCreateSessionBody()));

    expect(response.status).toBe(409);
  });

  it("retorna 409 quando a sala está sem vaga (capacidade excedida)", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const createSession = vi
      .fn()
      .mockRejectedValue(new RoomAtCapacityError(VALID_ROOM_ID));
    vi.mocked(createSchedulingService).mockReturnValue({
      createSession,
    } as never);

    const response = await POST(createSessionRequest(validCreateSessionBody()));

    expect(response.status).toBe(409);
  });

  it("retorna 422 quando algum paciente está inativo", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const createSession = vi
      .fn()
      .mockRejectedValue(new PatientInactiveError([VALID_PATIENT_ID]));
    vi.mocked(createSchedulingService).mockReturnValue({
      createSession,
    } as never);

    const response = await POST(createSessionRequest(validCreateSessionBody()));

    expect(response.status).toBe(422);
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await POST(createSessionRequest(validCreateSessionBody()));

    expect(response.status).toBe(401);
  });
});
