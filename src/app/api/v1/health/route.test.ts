import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/health", () => {
  it("responde 200 com status ok, sem depender de banco ou variáveis de ambiente", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
