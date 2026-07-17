import { describe, expect, it } from "vitest";
import { isValidStatusTransition, type AttendeeStatus } from "./session-state-machine";

describe("isValidStatusTransition", () => {
  const cases: Array<[AttendeeStatus, AttendeeStatus, boolean]> = [
    ["agendada", "confirmada", true],
    ["agendada", "realizada", true],
    ["agendada", "falta", true],
    ["agendada", "cancelada", true],
    ["confirmada", "realizada", true],
    ["confirmada", "falta", true],
    ["confirmada", "cancelada", true],
    ["confirmada", "agendada", false],
    ["realizada", "agendada", false],
    ["realizada", "falta", false],
    ["falta", "realizada", false],
    ["cancelada", "agendada", false],
    ["agendada", "agendada", false],
  ];

  it.each(cases)("de %s para %s → %s", (from, to, expected) => {
    expect(isValidStatusTransition(from, to)).toBe(expected);
  });
});
