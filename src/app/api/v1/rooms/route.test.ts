import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthenticatedError } from "@/modules/auth/authorization";
import { DuplicateRoomNameError } from "@/db/repositories/rooms-repository.errors";

vi.mock("@/modules/auth/session", () => ({
  requireSessionUser: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/rooms-repository", () => ({
  createRoomsRepository: vi.fn(),
}));

import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { requireRole, requireSessionUser } from "@/modules/auth/session";
import { GET, POST } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

const gestoraUser = { ...sessionUser, professionalId: "prof-gestora", role: "gestora" as const };

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/rooms", () => {
  it("retorna a lista de salas da clínica do usuário logado", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const listRooms = vi
      .fn()
      .mockResolvedValue([{ id: "room-1", name: "Sala 1" }]);
    vi.mocked(createRoomsRepository).mockReturnValue({ listRooms } as never);

    const response = await GET(new Request("http://localhost/api/v1/rooms"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      rooms: [{ id: "room-1", name: "Sala 1" }],
    });
    expect(listRooms).toHaveBeenCalledWith({ activeOnly: false });
  });

  it("repassa activeOnly=true da query string", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const listRooms = vi.fn().mockResolvedValue([]);
    vi.mocked(createRoomsRepository).mockReturnValue({ listRooms } as never);

    await GET(new Request("http://localhost/api/v1/rooms?activeOnly=true"));

    expect(listRooms).toHaveBeenCalledWith({ activeOnly: true });
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await GET(new Request("http://localhost/api/v1/rooms"));

    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/rooms", () => {
  it("gestora cria sala e recebe 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const createRoom = vi.fn().mockResolvedValue({ id: "room-2", name: "Sala 3", type: "individual", capacity: 1, active: true });
    vi.mocked(createRoomsRepository).mockReturnValue({ createRoom } as never);

    const response = await POST(postRequest({ name: "Sala 3", type: "individual", capacity: 1 }));

    expect(response.status).toBe(201);
    expect(createRoom).toHaveBeenCalledWith(
      { name: "Sala 3", type: "individual", capacity: 1 },
      { type: "professional", professionalId: "prof-gestora" },
    );
  });

  it("fisioterapeuta recebe 403", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError(["gestora"]));

    const response = await POST(postRequest({ name: "Sala 3", type: "individual", capacity: 1 }));

    expect(response.status).toBe(403);
  });

  it("retorna 409 em nome duplicado", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const createRoom = vi.fn().mockRejectedValue(new DuplicateRoomNameError("Sala 1"));
    vi.mocked(createRoomsRepository).mockReturnValue({ createRoom } as never);

    const response = await POST(postRequest({ name: "Sala 1", type: "individual", capacity: 1 }));

    expect(response.status).toBe(409);
  });

  it("retorna 400 para capacity < 1", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);

    const response = await POST(postRequest({ name: "Sala 3", type: "individual", capacity: 0 }));

    expect(response.status).toBe(400);
  });
});
