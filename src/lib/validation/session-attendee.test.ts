import { describe, expect, it } from "vitest";
import { updateAttendeeStatusSchema } from "./session-attendee";

describe("updateAttendeeStatusSchema", () => {
  it.each(["confirmada", "realizada", "falta", "cancelada"])(
    "aceita status '%s'",
    (status) => {
      expect(updateAttendeeStatusSchema.safeParse({ status }).success).toBe(
        true,
      );
    },
  );

  it("rejeita 'agendada' (só é estado inicial de criação, nunca uma transição)", () => {
    expect(
      updateAttendeeStatusSchema.safeParse({ status: "agendada" }).success,
    ).toBe(false);
  });

  it("rejeita status desconhecido", () => {
    expect(
      updateAttendeeStatusSchema.safeParse({ status: "invalido" }).success,
    ).toBe(false);
  });

  it("rejeita corpo sem status", () => {
    expect(updateAttendeeStatusSchema.safeParse({}).success).toBe(false);
  });
});
