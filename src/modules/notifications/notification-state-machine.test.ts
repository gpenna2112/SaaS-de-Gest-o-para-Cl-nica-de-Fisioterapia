import { describe, expect, it } from "vitest";
import {
  isValidNotificationStatusTransition,
  predecessorsOf,
  type NotificationStatus,
} from "./notification-state-machine";

describe("isValidNotificationStatusTransition", () => {
  const cases: Array<[NotificationStatus, NotificationStatus, boolean]> = [
    ["pendente", "enviada", true],
    ["pendente", "falha", true],
    ["pendente", "cancelada", true],
    ["pendente", "respondida", false],
    ["pendente", "entregue", false],
    ["enviada", "entregue", true],
    ["enviada", "falha", true],
    ["enviada", "respondida", true],
    ["enviada", "cancelada", false],
    ["entregue", "respondida", true],
    ["entregue", "falha", false],
    ["falha", "enviada", false],
    ["respondida", "enviada", false],
    ["cancelada", "pendente", false],
  ];

  it.each(cases)("de %s para %s → %s", (from, to, expected) => {
    expect(isValidNotificationStatusTransition(from, to)).toBe(expected);
  });
});

describe("predecessorsOf", () => {
  it("retorna os status de origem válidos para cada alvo", () => {
    expect(predecessorsOf("enviada").sort()).toEqual(["pendente"]);
    expect(predecessorsOf("falha").sort()).toEqual(["enviada", "pendente"].sort());
    expect(predecessorsOf("respondida").sort()).toEqual(["entregue", "enviada"].sort());
    expect(predecessorsOf("cancelada").sort()).toEqual(["pendente"]);
    expect(predecessorsOf("pendente")).toEqual([]);
  });
});
