import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "@/modules/auth/authorization";
import { NotEvolutionAuthorError } from "@/db/repositories/evolutions-repository.errors";

vi.mock("@/modules/auth/session", () => ({
  requireSessionUser: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/evolutions-repository", () => ({
  createEvolutionsRepository: vi.fn(),
}));

import { createEvolutionsRepository } from "@/db/repositories/evolutions-repository";
import { requireSessionUser } from "@/modules/auth/session";
import { PATCH } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

const EVOLUTION_ID = randomUUID();

function patchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/evolutions/${EVOLUTION_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPatch(body: unknown) {
  return PATCH(patchRequest(body), { params: Promise.resolve({ evolutionId: EVOLUTION_ID }) });
}

describe("PATCH /api/v1/evolutions/[evolutionId]", () => {
  it("atualiza o conteúdo e retorna 200", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const updateEvolution = vi.fn().mockResolvedValue({ id: EVOLUTION_ID, content: "Atualizado" });
    vi.mocked(createEvolutionsRepository).mockReturnValue({ updateEvolution } as never);

    const response = await callPatch({ content: "Atualizado" });

    expect(response.status).toBe(200);
    expect(updateEvolution).toHaveBeenCalledWith(
      EVOLUTION_ID,
      { content: "Atualizado" },
      { type: "professional", professionalId: "prof-1" },
    );
  });

  it("retorna 403 quando quem chama não é o autor", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const updateEvolution = vi.fn().mockRejectedValue(new NotEvolutionAuthorError(EVOLUTION_ID));
    vi.mocked(createEvolutionsRepository).mockReturnValue({ updateEvolution } as never);

    const response = await callPatch({ content: "X" });

    expect(response.status).toBe(403);
  });

  it("retorna 400 quando content está vazio", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await callPatch({ content: "" });

    expect(response.status).toBe(400);
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await callPatch({ content: "X" });

    expect(response.status).toBe(401);
  });
});
