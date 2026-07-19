import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, get, getApiErrorMessage, post } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api-client", () => {
  it("get retorna o corpo já parseado quando a resposta é ok", async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "1" }),
    });

    await expect(get("/api/v1/patients")).resolves.toEqual({ id: "1" });
  });

  it("get lança ApiError com status e corpo quando a resposta não é ok", async () => {
    stubFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "not found" }),
    });

    const error = await get("/api/v1/patients/does-not-exist").catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).body).toEqual({ error: "not found" });
  });

  it("post envia método, corpo serializado e Content-Type", async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "2" }),
    });

    await post("/api/v1/patients", { name: "Ana" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/patients",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Ana" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("trata corpo de resposta não-JSON como undefined em vez de lançar", async () => {
    stubFetch({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error("no body")),
    });

    await expect(get("/api/v1/patients")).resolves.toBeUndefined();
  });
});

describe("getApiErrorMessage", () => {
  it("extrai a mensagem de um ApiError com corpo { error }", () => {
    const error = new ApiError(409, { error: "Sala já ocupada nesse horário." });

    expect(getApiErrorMessage(error, "fallback")).toBe("Sala já ocupada nesse horário.");
  });

  it("retorna o fallback quando o erro não é um ApiError", () => {
    expect(getApiErrorMessage(new Error("qualquer coisa"), "fallback")).toBe("fallback");
  });

  it("retorna o fallback quando o corpo não tem 'error' como string", () => {
    const error = new ApiError(500, { message: "outro formato" });

    expect(getApiErrorMessage(error, "fallback")).toBe("fallback");
  });

  it("retorna o fallback quando o corpo é undefined", () => {
    const error = new ApiError(500, undefined);

    expect(getApiErrorMessage(error, "fallback")).toBe("fallback");
  });
});
