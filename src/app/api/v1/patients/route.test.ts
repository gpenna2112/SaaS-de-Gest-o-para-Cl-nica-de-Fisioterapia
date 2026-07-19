import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ProfessionalNotFoundError } from "@/db/repositories/patients-repository.errors";
import { UnauthenticatedError } from "@/modules/auth/authorization";

vi.mock("@/modules/auth/session", () => ({
  requireSessionUser: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/patients-repository", () => ({
  createPatientsRepository: vi.fn(),
}));

import { createPatientsRepository } from "@/db/repositories/patients-repository";
import { requireSessionUser } from "@/modules/auth/session";
import { GET, POST } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

const VALID_PROFESSIONAL_ID = randomUUID();

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/patients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/v1/patients", () => {
  it("retorna a lista de pacientes da clínica do usuário logado", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const listPatients = vi.fn().mockResolvedValue([{ id: "p1", name: "Ana" }]);
    vi.mocked(createPatientsRepository).mockReturnValue({
      listPatients,
    } as never);

    const response = await GET(new Request("http://localhost/api/v1/patients"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      patients: [{ id: "p1", name: "Ana" }],
    });
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await GET(new Request("http://localhost/api/v1/patients"));

    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/patients", () => {
  it("cria o paciente e retorna 201", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const createPatient = vi.fn().mockResolvedValue({ id: "p1", name: "Ana" });
    vi.mocked(createPatientsRepository).mockReturnValue({
      createPatient,
    } as never);

    const response = await POST(
      jsonRequest({
        primaryProfessionalId: VALID_PROFESSIONAL_ID,
        name: "Ana",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      patient: { id: "p1", name: "Ana" },
    });
    expect(createPatient).toHaveBeenCalledWith(
      { primaryProfessionalId: VALID_PROFESSIONAL_ID, name: "Ana" },
      { type: "professional", professionalId: "prof-1" },
    );
  });

  it("retorna 400 quando o nome está vazio", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await POST(
      jsonRequest({ primaryProfessionalId: VALID_PROFESSIONAL_ID, name: "" }),
    );

    expect(response.status).toBe(400);
  });

  it("retorna 400 quando primaryProfessionalId não é um uuid", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await POST(
      jsonRequest({ primaryProfessionalId: "not-a-uuid", name: "Ana" }),
    );

    expect(response.status).toBe(400);
  });

  it("retorna 404 quando o profissional responsável não existe", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const createPatient = vi
      .fn()
      .mockRejectedValue(new ProfessionalNotFoundError(VALID_PROFESSIONAL_ID));
    vi.mocked(createPatientsRepository).mockReturnValue({
      createPatient,
    } as never);

    const response = await POST(
      jsonRequest({
        primaryProfessionalId: VALID_PROFESSIONAL_ID,
        name: "Ana",
      }),
    );

    expect(response.status).toBe(404);
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await POST(
      jsonRequest({
        primaryProfessionalId: VALID_PROFESSIONAL_ID,
        name: "Ana",
      }),
    );

    expect(response.status).toBe(401);
  });
});
