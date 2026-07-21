import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "@/modules/auth/authorization";
import { RoomConflictError, SessionNotFoundError } from "@/db/repositories/scheduling-repository.errors";

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

const VALID_ROOM_ID = randomUUID();
const VALID_SESSION_ID = randomUUID();

function patchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/sessions/${VALID_SESSION_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    roomId: VALID_ROOM_ID,
    scheduledStart: "2026-07-20T14:00:00-03:00",
    scheduledEnd: "2026-07-20T14:50:00-03:00",
    ...overrides,
  };
}

async function callPatch(body: unknown) {
  return PATCH(patchRequest(body), { params: Promise.resolve({ sessionId: VALID_SESSION_ID }) });
}

describe("PATCH /api/v1/sessions/[sessionId]", () => {
  it("remarca a sessão e retorna 200", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const rescheduleSession = vi.fn().mockResolvedValue({
      id: VALID_SESSION_ID,
      professionalId: "prof-1",
      roomId: VALID_ROOM_ID,
      scheduledStart: new Date("2026-07-20T14:00:00-03:00"),
      scheduledEnd: new Date("2026-07-20T14:50:00-03:00"),
    });
    vi.mocked(createSchedulingService).mockReturnValue({ rescheduleSession } as never);

    const response = await callPatch(validBody());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session.roomId).toBe(VALID_ROOM_ID);
    expect(rescheduleSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: VALID_SESSION_ID, roomId: VALID_ROOM_ID }),
      { type: "professional", professionalId: "prof-1" },
    );
  });

  it("retorna 409 em conflito de sala", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const rescheduleSession = vi.fn().mockRejectedValue(new RoomConflictError(VALID_ROOM_ID));
    vi.mocked(createSchedulingService).mockReturnValue({ rescheduleSession } as never);

    const response = await callPatch(validBody());

    expect(response.status).toBe(409);
  });

  it("retorna 404 quando a sessão não existe", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const rescheduleSession = vi.fn().mockRejectedValue(new SessionNotFoundError(VALID_SESSION_ID));
    vi.mocked(createSchedulingService).mockReturnValue({ rescheduleSession } as never);

    const response = await callPatch(validBody());

    expect(response.status).toBe(404);
  });

  it("retorna 400 quando o horário de término não é depois do início", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await callPatch(
      validBody({ scheduledStart: "2026-07-20T14:00:00-03:00", scheduledEnd: "2026-07-20T13:00:00-03:00" }),
    );

    expect(response.status).toBe(400);
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await callPatch(validBody());

    expect(response.status).toBe(401);
  });
});
