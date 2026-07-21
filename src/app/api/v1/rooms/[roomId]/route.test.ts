import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/modules/auth/authorization";

vi.mock("@/modules/auth/session", () => ({
  requireRole: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/rooms-repository", () => ({
  createRoomsRepository: vi.fn(),
}));

import { createRoomsRepository } from "@/db/repositories/rooms-repository";
import { requireRole } from "@/modules/auth/session";
import { PATCH } from "./route";

const gestoraUser = {
  professionalId: "prof-gestora",
  clinicId: "clinic-1",
  role: "gestora" as const,
  name: "Gestora Teste",
  email: "gestora@test.local",
};

const ROOM_ID = randomUUID();
const EXISTING = { id: ROOM_ID, name: "Sala 1", type: "individual", capacity: 1, active: true };

function patchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/rooms/${ROOM_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPatch(body: unknown) {
  return PATCH(patchRequest(body), { params: Promise.resolve({ roomId: ROOM_ID }) });
}

describe("PATCH /api/v1/rooms/[roomId]", () => {
  it("atualiza campos e retorna 200", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const getRoom = vi.fn().mockResolvedValue(EXISTING);
    const updateRoom = vi.fn().mockResolvedValue({ ...EXISTING, capacity: 3 });
    vi.mocked(createRoomsRepository).mockReturnValue({ getRoom, updateRoom } as never);

    const response = await callPatch({ capacity: 3 });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.room.capacity).toBe(3);
  });

  it("active:false chama deactivateRoom", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const getRoom = vi.fn().mockResolvedValue(EXISTING);
    const deactivateRoom = vi.fn().mockResolvedValue({ ...EXISTING, active: false });
    vi.mocked(createRoomsRepository).mockReturnValue({ getRoom, deactivateRoom } as never);

    const response = await callPatch({ active: false });

    expect(response.status).toBe(200);
    expect(deactivateRoom).toHaveBeenCalledWith(ROOM_ID, { type: "professional", professionalId: "prof-gestora" });
  });

  it("retorna 403 quando quem chama não é gestora", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError(["gestora"]));

    const response = await callPatch({ active: false });

    expect(response.status).toBe(403);
  });

  it("retorna 404 quando a sala não existe", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const getRoom = vi.fn().mockResolvedValue(null);
    vi.mocked(createRoomsRepository).mockReturnValue({ getRoom } as never);

    const response = await callPatch({ name: "X" });

    expect(response.status).toBe(404);
  });
});
