import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthenticatedError } from "@/modules/auth/authorization";
import { DuplicateProfessionalEmailError } from "@/db/repositories/professionals-repository.errors";

vi.mock("@/modules/auth/session", () => ({
  requireSessionUser: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/professionals-repository", () => ({
  createProfessionalsRepository: vi.fn(),
}));

import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
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
  return new Request("http://localhost/api/v1/professionals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

describe("POST /api/v1/professionals", () => {
  it("gestora cria profissional e recebe 201", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const createProfessional = vi.fn().mockResolvedValue({ id: "prof-2", name: "Nova Fisio", email: "nova@x.test", role: "fisioterapeuta", active: true });
    vi.mocked(createProfessionalsRepository).mockReturnValue({ createProfessional } as never);

    const response = await POST(postRequest({ name: "Nova Fisio", email: "nova@x.test", role: "fisioterapeuta" }));

    expect(response.status).toBe(201);
    expect(createProfessional).toHaveBeenCalledWith(
      { name: "Nova Fisio", email: "nova@x.test", role: "fisioterapeuta" },
      { type: "professional", professionalId: "prof-gestora" },
    );
  });

  it("fisioterapeuta recebe 403 (requireRole barra antes do repositório)", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError(["gestora"]));

    const response = await POST(postRequest({ name: "X", email: "x@x.test", role: "fisioterapeuta" }));

    expect(response.status).toBe(403);
  });

  it("retorna 409 em e-mail duplicado", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const createProfessional = vi.fn().mockRejectedValue(new DuplicateProfessionalEmailError("dup@x.test"));
    vi.mocked(createProfessionalsRepository).mockReturnValue({ createProfessional } as never);

    const response = await POST(postRequest({ name: "X", email: "dup@x.test", role: "fisioterapeuta" }));

    expect(response.status).toBe(409);
  });

  it("retorna 400 para role inválido", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);

    const response = await POST(postRequest({ name: "X", email: "x@x.test", role: "admin" }));

    expect(response.status).toBe(400);
  });
});
