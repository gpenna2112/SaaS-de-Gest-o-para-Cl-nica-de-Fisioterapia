import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "@/modules/auth/authorization";
import {
  PatientAlreadyAttendingError,
  PatientInactiveError,
  PatientNotFoundError,
  RoomAtCapacityError,
  SessionNotActiveError,
  SessionNotFoundError,
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
vi.mock("@/db/repositories/notifications-repository", () => ({
  createNotificationsRepository: vi.fn(),
}));
vi.mock("@/modules/scheduling/scheduling-service", () => ({
  createSchedulingService: vi.fn(),
}));

import { createSchedulingService } from "@/modules/scheduling/scheduling-service";
import { requireSessionUser } from "@/modules/auth/session";
import { POST } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

const VALID_SESSION_ID = randomUUID();
const VALID_PATIENT_ID = randomUUID();

function addAttendeeRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/sessions/${VALID_SESSION_ID}/attendees`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paramsFor(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) };
}

describe("POST /api/v1/sessions/:sessionId/attendees", () => {
  it("adiciona o participante e retorna 201", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const addAttendee = vi.fn().mockResolvedValue({
      session: { id: VALID_SESSION_ID },
      attendee: {
        id: "att-1",
        sessionId: VALID_SESSION_ID,
        patientId: VALID_PATIENT_ID,
        status: "agendada",
      },
    });
    vi.mocked(createSchedulingService).mockReturnValue({
      addAttendee,
    } as never);

    const response = await POST(
      addAttendeeRequest({ patientId: VALID_PATIENT_ID }),
      paramsFor(VALID_SESSION_ID),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.attendee).toEqual({
      id: "att-1",
      sessionId: VALID_SESSION_ID,
      patientId: VALID_PATIENT_ID,
      status: "agendada",
    });
    expect(addAttendee).toHaveBeenCalledWith(VALID_SESSION_ID, VALID_PATIENT_ID, {
      type: "professional",
      professionalId: "prof-1",
    });
  });

  it("retorna 400 quando patientId não é um UUID", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await POST(
      addAttendeeRequest({ patientId: "not-a-uuid" }),
      paramsFor(VALID_SESSION_ID),
    );

    expect(response.status).toBe(400);
  });

  it("retorna 404 quando a sessão não existe", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const addAttendee = vi
      .fn()
      .mockRejectedValue(new SessionNotFoundError(VALID_SESSION_ID));
    vi.mocked(createSchedulingService).mockReturnValue({
      addAttendee,
    } as never);

    const response = await POST(
      addAttendeeRequest({ patientId: VALID_PATIENT_ID }),
      paramsFor(VALID_SESSION_ID),
    );

    expect(response.status).toBe(404);
  });

  it("retorna 404 quando o paciente não existe", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const addAttendee = vi
      .fn()
      .mockRejectedValue(new PatientNotFoundError([VALID_PATIENT_ID]));
    vi.mocked(createSchedulingService).mockReturnValue({
      addAttendee,
    } as never);

    const response = await POST(
      addAttendeeRequest({ patientId: VALID_PATIENT_ID }),
      paramsFor(VALID_SESSION_ID),
    );

    expect(response.status).toBe(404);
  });

  it("retorna 409 quando a sala está sem vaga (capacidade excedida)", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const addAttendee = vi
      .fn()
      .mockRejectedValue(new RoomAtCapacityError("room-1"));
    vi.mocked(createSchedulingService).mockReturnValue({
      addAttendee,
    } as never);

    const response = await POST(
      addAttendeeRequest({ patientId: VALID_PATIENT_ID }),
      paramsFor(VALID_SESSION_ID),
    );

    expect(response.status).toBe(409);
  });

  it("retorna 409 quando a sessão não está ativa", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const addAttendee = vi
      .fn()
      .mockRejectedValue(new SessionNotActiveError(VALID_SESSION_ID));
    vi.mocked(createSchedulingService).mockReturnValue({
      addAttendee,
    } as never);

    const response = await POST(
      addAttendeeRequest({ patientId: VALID_PATIENT_ID }),
      paramsFor(VALID_SESSION_ID),
    );

    expect(response.status).toBe(409);
  });

  it("retorna 409 quando o paciente já está vinculado à sessão", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const addAttendee = vi
      .fn()
      .mockRejectedValue(
        new PatientAlreadyAttendingError(VALID_SESSION_ID, VALID_PATIENT_ID),
      );
    vi.mocked(createSchedulingService).mockReturnValue({
      addAttendee,
    } as never);

    const response = await POST(
      addAttendeeRequest({ patientId: VALID_PATIENT_ID }),
      paramsFor(VALID_SESSION_ID),
    );

    expect(response.status).toBe(409);
  });

  it("retorna 422 quando o paciente está inativo", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const addAttendee = vi
      .fn()
      .mockRejectedValue(new PatientInactiveError([VALID_PATIENT_ID]));
    vi.mocked(createSchedulingService).mockReturnValue({
      addAttendee,
    } as never);

    const response = await POST(
      addAttendeeRequest({ patientId: VALID_PATIENT_ID }),
      paramsFor(VALID_SESSION_ID),
    );

    expect(response.status).toBe(422);
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await POST(
      addAttendeeRequest({ patientId: VALID_PATIENT_ID }),
      paramsFor(VALID_SESSION_ID),
    );

    expect(response.status).toBe(401);
  });
});
