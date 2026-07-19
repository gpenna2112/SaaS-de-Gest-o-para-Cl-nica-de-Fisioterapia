import type { ZodError, ZodType } from "zod";

/**
 * Erro específico de corpo de requisição inválido — nunca lançado por
 * validação interna (env, config). Distinto de um `ZodError` cru para que
 * `error-response.ts` só mapeie para 400 o que realmente veio do cliente,
 * não qualquer `ZodError` que apareça em qualquer lugar da pilha de chamadas
 * (ex.: `getEnv()` também usa zod e lançaria um `ZodError` indistinguível).
 */
export class RequestValidationError extends Error {
  constructor(public readonly issues: ZodError["issues"]) {
    super("Corpo da requisição inválido.");
    this.name = "RequestValidationError";
  }
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new RequestValidationError([]);
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new RequestValidationError(result.error.issues);
  }
  return result.data;
}
