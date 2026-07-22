import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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
import { PATCH } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

const PATIENT_ID = randomUUID();
const EXISTING_PATIENT = { id: PATIENT_ID, name: "Ana", phone: null, active: true, primaryProfessionalId: "prof-1" };

function patchRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/patients/${PATIENT_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPatch(body: unknown) {
  return PATCH(patchRequest(body), { params: Promise.resolve({ patientId: PATIENT_ID }) });
}

describe("PATCH /api/v1/patients/[patientId]", () => {
  it("atualiza campos e retorna 200", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const getPatient = vi.fn().mockResolvedValue(EXISTING_PATIENT);
    const updatePatient = vi.fn().mockResolvedValue({ ...EXISTING_PATIENT, name: "Ana Souza" });
    vi.mocked(createPatientsRepository).mockReturnValue({ getPatient, updatePatient } as never);

    const response = await callPatch({ name: "Ana Souza" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.patient.name).toBe("Ana Souza");
    expect(updatePatient).toHaveBeenCalledWith(
      PATIENT_ID,
      { name: "Ana Souza" },
      { type: "professional", professionalId: "prof-1" },
    );
  });

  it("active:false chama deactivatePatient", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const getPatient = vi.fn().mockResolvedValue(EXISTING_PATIENT);
    const deactivatePatient = vi.fn().mockResolvedValue({ ...EXISTING_PATIENT, active: false });
    vi.mocked(createPatientsRepository).mockReturnValue({ getPatient, deactivatePatient } as never);

    const response = await callPatch({ active: false });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.patient.active).toBe(false);
    expect(deactivatePatient).toHaveBeenCalledWith(PATIENT_ID, { type: "professional", professionalId: "prof-1" });
  });

  it("active:true chama reactivatePatient", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const getPatient = vi.fn().mockResolvedValue({ ...EXISTING_PATIENT, active: false });
    const reactivatePatient = vi.fn().mockResolvedValue({ ...EXISTING_PATIENT, active: true });
    vi.mocked(createPatientsRepository).mockReturnValue({ getPatient, reactivatePatient } as never);

    const response = await callPatch({ active: true });

    expect(response.status).toBe(200);
    expect(reactivatePatient).toHaveBeenCalledWith(PATIENT_ID, { type: "professional", professionalId: "prof-1" });
  });

  it("retorna 404 quando o paciente não existe", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const getPatient = vi.fn().mockResolvedValue(null);
    vi.mocked(createPatientsRepository).mockReturnValue({ getPatient } as never);

    const response = await callPatch({ name: "X" });

    expect(response.status).toBe(404);
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await callPatch({ name: "X" });

    expect(response.status).toBe(401);
  });
});
