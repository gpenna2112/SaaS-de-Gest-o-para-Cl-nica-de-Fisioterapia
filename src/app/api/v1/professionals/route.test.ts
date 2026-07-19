import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "@/modules/auth/authorization";

vi.mock("@/modules/auth/session", () => ({
  requireSessionUser: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/professionals-repository", () => ({
  createProfessionalsRepository: vi.fn(),
}));

import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { requireSessionUser } from "@/modules/auth/session";
import { GET } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

describe("GET /api/v1/professionals", () => {
  it("retorna a lista de profissionais da clínica do usuário logado", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const listProfessionals = vi
      .fn()
      .mockResolvedValue([{ id: "prof-1", name: "Fisio Teste" }]);
    vi.mocked(createProfessionalsRepository).mockReturnValue({
      listProfessionals,
    } as never);

    const response = await GET(
      new Request("http://localhost/api/v1/professionals"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      professionals: [{ id: "prof-1", name: "Fisio Teste" }],
    });
    expect(listProfessionals).toHaveBeenCalledWith({ activeOnly: false });
  });

  it("repassa activeOnly=true da query string", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const listProfessionals = vi.fn().mockResolvedValue([]);
    vi.mocked(createProfessionalsRepository).mockReturnValue({
      listProfessionals,
    } as never);

    await GET(
      new Request("http://localhost/api/v1/professionals?activeOnly=true"),
    );

    expect(listProfessionals).toHaveBeenCalledWith({ activeOnly: true });
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await GET(
      new Request("http://localhost/api/v1/professionals"),
    );

    expect(response.status).toBe(401);
  });
});
