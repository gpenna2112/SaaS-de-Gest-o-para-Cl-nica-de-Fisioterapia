import { describe, expect, it } from "vitest";
import { computeConfirmationScheduledFor } from "./scheduled-for";

describe("computeConfirmationScheduledFor", () => {
  it("retorna 08:00 (-03:00) do mesmo dia calendário da sessão", () => {
    const sessionStart = new Date("2026-08-01T12:00:00-03:00"); // meio-dia, 1º de agosto, São Paulo
    const result = computeConfirmationScheduledFor(sessionStart);

    expect(result.toISOString()).toBe("2026-08-01T11:00:00.000Z"); // 08:00 -03:00 = 11:00 UTC
  });

  it("usa o dia calendário em América/São_Paulo, não em UTC — cruza a virada do dia", () => {
    // 01:00 UTC = 22:00 do dia anterior em São Paulo (UTC-3): ainda é "dia 31/07" na clínica.
    const sessionStart = new Date("2026-08-01T01:00:00Z");
    const result = computeConfirmationScheduledFor(sessionStart);

    expect(result.toISOString()).toBe("2026-07-31T11:00:00.000Z"); // 08:00 -03:00 do dia 31/07
  });

  it("sessão já às 08:00 da clínica → confirmação no mesmo horário", () => {
    const sessionStart = new Date("2026-08-01T08:00:00-03:00");
    const result = computeConfirmationScheduledFor(sessionStart);

    expect(result.toISOString()).toBe("2026-08-01T11:00:00.000Z");
  });
});
