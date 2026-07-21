import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/modules/auth/authorization";

vi.mock("@/modules/auth/session", () => ({
  requireRole: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/professionals-repository", () => ({
  createProfessionalsRepository: vi.fn(),
}));

import { createProfessionalsRepository } from "@/db/repositories/professionals-repository";
import { requireRole } from "@/modules/auth/session";
import { PATCH } from "./route";

const gestoraUser = {
  professionalId: "prof-gestora",
  clinicId: "clinic-1",
  role: "gestora" as const,
  name: "Gestora Teste",
  email: "gestora@test.local",
};

const PROFESSIONAL_ID = randomUUID();
const EXISTING = { id: PROFESSIONAL_ID, name: "Fisio X", email: "x@test.local", role: "fisioterapeuta", active: true };

function patchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/professionals/${PROFESSIONAL_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPatch(body: unknown) {
  return PATCH(patchRequest(body), { params: Promise.resolve({ professionalId: PROFESSIONAL_ID }) });
}

describe("PATCH /api/v1/professionals/[professionalId]", () => {
  it("atualiza campos e retorna 200", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const getProfessional = vi.fn().mockResolvedValue(EXISTING);
    const updateProfessional = vi.fn().mockResolvedValue({ ...EXISTING, role: "gestora" });
    vi.mocked(createProfessionalsRepository).mockReturnValue({ getProfessional, updateProfessional } as never);

    const response = await callPatch({ role: "gestora" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.professional.role).toBe("gestora");
  });

  it("active:false chama deactivateProfessional", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const getProfessional = vi.fn().mockResolvedValue(EXISTING);
    const deactivateProfessional = vi.fn().mockResolvedValue({ ...EXISTING, active: false });
    vi.mocked(createProfessionalsRepository).mockReturnValue({ getProfessional, deactivateProfessional } as never);

    const response = await callPatch({ active: false });

    expect(response.status).toBe(200);
    expect(deactivateProfessional).toHaveBeenCalledWith(PROFESSIONAL_ID, {
      type: "professional",
      professionalId: "prof-gestora",
    });
  });

  it("retorna 403 quando quem chama não é gestora", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError(["gestora"]));

    const response = await callPatch({ active: false });

    expect(response.status).toBe(403);
  });

  it("retorna 404 quando o profissional não existe", async () => {
    vi.mocked(requireRole).mockResolvedValue(gestoraUser);
    const getProfessional = vi.fn().mockResolvedValue(null);
    vi.mocked(createProfessionalsRepository).mockReturnValue({ getProfessional } as never);

    const response = await callPatch({ name: "X" });

    expect(response.status).toBe(404);
  });
});
