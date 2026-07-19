import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "@/modules/auth/authorization";
import {
  InvalidStatusTransitionError,
  SessionAttendeeNotFoundError,
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
import { PATCH } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/session-attendees/att-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paramsFor(attendeeId: string) {
  return { params: Promise.resolve({ attendeeId }) };
}

describe("PATCH /api/v1/session-attendees/:attendeeId", () => {
  it("atualiza o status e retorna 200", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const updateAttendeeStatus = vi.fn().mockResolvedValue({
      id: "att-1",
      sessionId: "session-1",
      patientId: "patient-1",
      status: "realizada",
      confirmedAt: null,
    });
    vi.mocked(createSchedulingService).mockReturnValue({
      updateAttendeeStatus,
    } as never);

    const response = await PATCH(
      patchRequest({ status: "realizada" }),
      paramsFor("att-1"),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attendee).toEqual({
      id: "att-1",
      sessionId: "session-1",
      patientId: "patient-1",
      status: "realizada",
      confirmedAt: null,
    });
    expect(updateAttendeeStatus).toHaveBeenCalledWith("att-1", "realizada", {
      type: "professional",
      professionalId: "prof-1",
    });
  });

  it("retorna 400 para status fora do enum permitido", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await PATCH(
      patchRequest({ status: "invalido" }),
      paramsFor("att-1"),
    );

    expect(response.status).toBe(400);
  });

  it("retorna 400 para 'agendada' (não é uma transição válida)", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await PATCH(
      patchRequest({ status: "agendada" }),
      paramsFor("att-1"),
    );

    expect(response.status).toBe(400);
  });

  it("retorna 404 quando o participante não existe", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const updateAttendeeStatus = vi
      .fn()
      .mockRejectedValue(new SessionAttendeeNotFoundError("att-x"));
    vi.mocked(createSchedulingService).mockReturnValue({
      updateAttendeeStatus,
    } as never);

    const response = await PATCH(
      patchRequest({ status: "realizada" }),
      paramsFor("att-x"),
    );

    expect(response.status).toBe(404);
  });

  it("retorna 409 para transição de status inválida", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const updateAttendeeStatus = vi
      .fn()
      .mockRejectedValue(
        new InvalidStatusTransitionError("realizada", "confirmada"),
      );
    vi.mocked(createSchedulingService).mockReturnValue({
      updateAttendeeStatus,
    } as never);

    const response = await PATCH(
      patchRequest({ status: "confirmada" }),
      paramsFor("att-1"),
    );

    expect(response.status).toBe(409);
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await PATCH(
      patchRequest({ status: "realizada" }),
      paramsFor("att-1"),
    );

    expect(response.status).toBe(401);
  });
});
