import { createDbClient, type DbClient } from "@/db/client";
import { createProfessionalsAuthRepository } from "@/db/repositories/professionals-auth-repository";
import { getEnv } from "@/lib/env";
import { getAuth } from "./better-auth-instance";
import { ForbiddenError, hasRole, UnauthenticatedError, type Role, type SessionUser } from "./authorization";

export type { SessionUser, Role };

let db: DbClient | undefined;
function getDb(): DbClient {
  db ??= createDbClient(getEnv().DATABASE_URL);
  return db;
}

/**
 * Único ponto (além de better-auth-instance.ts e da rota catch-all)
 * autorizado a chamar a API do Better Auth diretamente (ADR-0006/0017).
 * Resolve o cookie de sessão para o profissional correspondente.
 *
 * Retorna `null` tanto para "não logado" quanto para "logado mas
 * desativado" — o chamador não distingue os dois casos, e não deveria: os
 * dois significam "sem acesso agora". Reconsultado a cada chamada, não
 * cacheado — `professionals.active` precisa valer em toda requisição, não
 * só no login (sessão dura ~60 dias; sem essa checagem viva, alguém
 * desativado manteria acesso até a sessão expirar).
 */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const authSession = await getAuth().api.getSession({ headers });
  if (!authSession) {
    return null;
  }

  const professionalsAuthRepository = createProfessionalsAuthRepository(getDb());
  const professional = await professionalsAuthRepository.findByAuthUserId(authSession.user.id);
  if (!professional || !professional.active) {
    return null;
  }

  return {
    professionalId: professional.id,
    clinicId: professional.clinicId,
    role: professional.role as Role,
    name: professional.name,
    email: professional.email,
  };
}

/**
 * Guarda de rota (ADR-0017, Decisão 5): autoridade completa, chamada no
 * topo de cada route handler protegido. Lança em vez de retornar
 * Response — a rota (casca fina, ADR-0001) decide o mapeamento HTTP
 * (401/403), este módulo não conhece Next.js.
 */
export async function requireSessionUser(headers: Headers): Promise<SessionUser> {
  const sessionUser = await getSessionUser(headers);
  if (!sessionUser) {
    throw new UnauthenticatedError();
  }
  return sessionUser;
}

export async function requireRole(headers: Headers, allowed: readonly Role[]): Promise<SessionUser> {
  const sessionUser = await requireSessionUser(headers);
  if (!hasRole(sessionUser, allowed)) {
    throw new ForbiddenError(allowed);
  }
  return sessionUser;
}
