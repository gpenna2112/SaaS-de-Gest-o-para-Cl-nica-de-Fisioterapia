import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "@/modules/auth/authorization";
import { EvolutionAlreadyExistsError } from "@/db/repositories/evolutions-repository.errors";

vi.mock("@/modules/auth/session", () => ({
  requireSessionUser: vi.fn(),
}));
vi.mock("@/app/_lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/db/repositories/scheduling-repository", () => ({
  createSchedulingRepository: vi.fn(),
}));
vi.mock("@/db/repositories/evolutions-repository", () => ({
  createEvolutionsRepository: vi.fn(),
}));

import { createEvolutionsRepository } from "@/db/repositories/evolutions-repository";
import { createSchedulingRepository } from "@/db/repositories/scheduling-repository";
import { requireSessionUser } from "@/modules/auth/session";
import { POST } from "./route";

const sessionUser = {
  professionalId: "prof-1",
  clinicId: "clinic-1",
  role: "fisioterapeuta" as const,
  name: "Fisio Teste",
  email: "fisio@test.local",
};

const ATTENDEE_ID = randomUUID();

function postRequest(body: unknown): Request {
  return new Request(`http://localhost/api/v1/session-attendees/${ATTENDEE_ID}/evolution`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown) {
  return POST(postRequest(body), { params: Promise.resolve({ attendeeId: ATTENDEE_ID }) });
}

describe("POST /api/v1/session-attendees/[attendeeId]/evolution", () => {
  it("cria a evolução quando o attendee está realizada e retorna 201", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const getAttendee = vi.fn().mockResolvedValue({ id: ATTENDEE_ID, patientId: "patient-1", status: "realizada" });
    vi.mocked(createSchedulingRepository).mockReturnValue({ getAttendee } as never);
    const createEvolution = vi.fn().mockResolvedValue({ id: "evo-1", content: "Melhora notável" });
    vi.mocked(createEvolutionsRepository).mockReturnValue({ createEvolution } as never);

    const response = await callPost({ content: "Melhora notável" });

    expect(response.status).toBe(201);
    expect(createEvolution).toHaveBeenCalledWith(
      { sessionAttendeeId: ATTENDEE_ID, patientId: "patient-1", content: "Melhora notável" },
      { type: "professional", professionalId: "prof-1" },
    );
  });

  it("retorna 422 quando o attendee não está realizada", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const getAttendee = vi.fn().mockResolvedValue({ id: ATTENDEE_ID, patientId: "patient-1", status: "agendada" });
    vi.mocked(createSchedulingRepository).mockReturnValue({ getAttendee } as never);

    const response = await callPost({ content: "X" });

    expect(response.status).toBe(422);
  });

  it("retorna 404 quando o attendee não existe", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const getAttendee = vi.fn().mockResolvedValue(null);
    vi.mocked(createSchedulingRepository).mockReturnValue({ getAttendee } as never);

    const response = await callPost({ content: "X" });

    expect(response.status).toBe(404);
  });

  it("retorna 409 quando já existe evolução para o attendee", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);
    const getAttendee = vi.fn().mockResolvedValue({ id: ATTENDEE_ID, patientId: "patient-1", status: "realizada" });
    vi.mocked(createSchedulingRepository).mockReturnValue({ getAttendee } as never);
    const createEvolution = vi.fn().mockRejectedValue(new EvolutionAlreadyExistsError(ATTENDEE_ID));
    vi.mocked(createEvolutionsRepository).mockReturnValue({ createEvolution } as never);

    const response = await callPost({ content: "X" });

    expect(response.status).toBe(409);
  });

  it("retorna 400 quando content está vazio", async () => {
    vi.mocked(requireSessionUser).mockResolvedValue(sessionUser);

    const response = await callPost({ content: "" });

    expect(response.status).toBe(400);
  });

  it("retorna 401 quando não há sessão", async () => {
    vi.mocked(requireSessionUser).mockRejectedValue(new UnauthenticatedError());

    const response = await callPost({ content: "X" });

    expect(response.status).toBe(401);
  });
});
