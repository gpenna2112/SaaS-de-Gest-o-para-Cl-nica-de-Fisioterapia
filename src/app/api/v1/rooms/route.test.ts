import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "@/modules/auth/authorization";

vi.mock("@/modules/auth/session", () => ({
  requireSessionUser: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/rooms-repository", () => ({
  createRoomsRepository: vi.fn(),
}));

import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { requireSessionUser } from "@/modules/auth/session";
import { GET } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

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
