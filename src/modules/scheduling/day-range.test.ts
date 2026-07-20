import { describe, expect, it } from "vitest";
import {
  addDaysToDateString,
  addMinutesToTime,
  combineDateAndTimeInSaoPaulo,
  dayRangeInSaoPaulo,
  formatDateLongPtBr,
  todayInSaoPaulo,
} from "./day-range";

describe("dayRangeInSaoPaulo", () => {
  it("início do dia é 00:00:00 -03:00, convertido para UTC", () => {
    const { start } = dayRangeInSaoPaulo("2026-07-20");

    expect(start.toISOString()).toBe("2026-07-20T03:00:00.000Z");
  });

  it("fim do dia é 23:59:59.999 -03:00, convertido para UTC (já no dia seguinte)", () => {
    const { end } = dayRangeInSaoPaulo("2026-07-20");

    expect(end.toISOString()).toBe("2026-07-21T02:59:59.999Z");
  });

  it("lança RangeError para uma data em formato inválido", () => {
    expect(() => dayRangeInSaoPaulo("não-é-uma-data")).toThrow(RangeError);
  });
});

describe("addDaysToDateString", () => {
  it("soma um dia dentro do mesmo mês", () => {
    expect(addDaysToDateString("2026-07-20", 1)).toBe("2026-07-21");
  });

  it("subtrai um dia cruzando a virada de mês", () => {
    expect(addDaysToDateString("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("soma um dia cruzando a virada de ano", () => {
    expect(addDaysToDateString("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("delta zero retorna a mesma data", () => {
    expect(addDaysToDateString("2026-07-20", 0)).toBe("2026-07-20");
  });
});

describe("todayInSaoPaulo", () => {
  it("retorna uma data no formato AAAA-MM-DD", () => {
    expect(todayInSaoPaulo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("combineDateAndTimeInSaoPaulo", () => {
  it("junta data e hora num ISO 8601 com o offset da clínica", () => {
    expect(combineDateAndTimeInSaoPaulo("2026-07-20", "13:00")).toBe("2026-07-20T13:00:00-03:00");
  });

  it("resultado é aceito pelo construtor de Date", () => {
    const iso = combineDateAndTimeInSaoPaulo("2026-07-20", "13:00");
    expect(new Date(iso).toISOString()).toBe("2026-07-20T16:00:00.000Z");
  });
});

describe("addMinutesToTime", () => {
  it("soma minutos dentro da mesma hora", () => {
    expect(addMinutesToTime("13:00", 50)).toBe("13:50");
  });

  it("soma minutos cruzando a hora", () => {
    expect(addMinutesToTime("13:40", 50)).toBe("14:30");
  });

  it("dá wrap em 24h ao passar da meia-noite", () => {
    expect(addMinutesToTime("23:40", 50)).toBe("00:30");
  });

  it("delta negativo subtrai minutos", () => {
    expect(addMinutesToTime("13:30", -50)).toBe("12:40");
  });
});

describe("formatDateLongPtBr", () => {
  it("formata por extenso em português, com dia da semana", () => {
    expect(formatDateLongPtBr("2026-07-20")).toBe("segunda-feira, 20 de julho");
  });

  it("formata corretamente uma data em outro mês/ano", () => {
    expect(formatDateLongPtBr("2027-01-01")).toBe("sexta-feira, 1 de janeiro");
  });

  it("lança RangeError para uma data em formato inválido", () => {
    expect(() => formatDateLongPtBr("não-é-uma-data")).toThrow(RangeError);
  });
});
