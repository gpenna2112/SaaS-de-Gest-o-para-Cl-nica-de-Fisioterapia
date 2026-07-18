export type Role = "fisioterapeuta" | "gestora";

export interface SessionUser {
  professionalId: string;
  clinicId: string;
  role: Role;
  name: string;
  email: string;
}

/**
 * `role` controla acesso a telas/ações, nunca restringe quem pode ser
 * `professional_id` de uma sessão de agenda — decisão já tomada na
 * modelagem original e reafirmada no ADR-0017 (Decisão 3). Autorização é
 * responsabilidade da camada de rota, não do repositório: `Actor` (usado
 * em scheduling/notifications/patients) continua sem campo de papel.
 */
export function hasRole(sessionUser: SessionUser | null, allowed: readonly Role[]): boolean {
  return sessionUser !== null && allowed.includes(sessionUser.role);
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sessão ausente ou inválida.");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(public readonly requiredRoles: readonly Role[]) {
    super(`Requer um dos papéis: ${requiredRoles.join(", ")}.`);
    this.name = "ForbiddenError";
  }
}
