import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSessionSchema } from "./session";

const PROFESSIONAL_ID = randomUUID();
const ROOM_ID = randomUUID();
const PATIENT_ID = randomUUID();

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    professionalId: PROFESSIONAL_ID,
    roomId: ROOM_ID,
    scheduledStart: "2026-07-20T13:00:00-03:00",
    scheduledEnd: "2026-07-20T13:50:00-03:00",
    patientIds: [PATIENT_ID],
    ...overrides,
  };
}

describe("createSessionSchema", () => {
  it("aceita entrada válida e transforma datas em Date", () => {
    const result = createSessionSchema.safeParse(validInput());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scheduledStart).toBeInstanceOf(Date);
      expect(result.data.scheduledEnd).toBeInstanceOf(Date);
    }
  });

  it("aceita datetime em UTC (sufixo Z)", () => {
    const result = createSessionSchema.safeParse(
      validInput({
        scheduledStart: "2026-07-20T16:00:00Z",
        scheduledEnd: "2026-07-20T16:50:00Z",
      }),
    );

    expect(result.success).toBe(true);
  });

  it("rejeita datetime sem timezone explícito", () => {
    const result = createSessionSchema.safeParse(
      validInput({ scheduledStart: "2026-07-20T13:00:00" }),
    );

    expect(result.success).toBe(false);
  });

  it("rejeita patientIds vazio", () => {
    const result = createSessionSchema.safeParse(
      validInput({ patientIds: [] }),
    );

    expect(result.success).toBe(false);
  });

  it("rejeita patientIds duplicados", () => {
    const result = createSessionSchema.safeParse(
      validInput({ patientIds: [PATIENT_ID, PATIENT_ID] }),
    );

    expect(result.success).toBe(false);
  });

  it("rejeita quando scheduledEnd não é depois de scheduledStart", () => {
    const result = createSessionSchema.safeParse(
      validInput({
        scheduledStart: "2026-07-20T13:50:00-03:00",
        scheduledEnd: "2026-07-20T13:00:00-03:00",
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejeita professionalId que não é uuid", () => {
    const result = createSessionSchema.safeParse(
      validInput({ professionalId: "not-a-uuid" }),
    );

    expect(result.success).toBe(false);
  });
});
