import { and, eq, isNull } from "drizzle-orm";
import type { DbClient, QueryExecutor, Tx } from "../client";
import { auditLog, professionals } from "../schema";

export type Professional = typeof professionals.$inferSelect;

interface AuditActor {
  type: "professional" | "system";
  professionalId?: string;
}

/**
 * Deliberadamente SEM `clinicId` na fábrica — diferente dos demais
 * repositórios (ADR-0007). O propósito aqui é resolver "quem é essa
 * identidade" ANTES de sabermos a clínica; usado só pelo módulo `auth`
 * (ADR-0017), nunca por scheduling/notifications/patients.
 */
export interface ProfessionalsAuthRepository {
  findByAuthUserId(authUserId: string, tx?: Tx): Promise<Professional | null>;
  /**
   * `email` não é globalmente único (só único por clínica) — pode haver
   * mais de uma linha em clínicas diferentes. O chamador decide o que
   * fazer com 0, 1 ou mais de 1 resultado (ver modules/auth/session.ts).
   */
  findUnclaimedByEmail(email: string, tx?: Tx): Promise<Professional[]>;
  linkAuthUser(professionalId: string, authUserId: string, actor: AuditActor, tx?: Tx): Promise<Professional>;
}

function assertRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }
  return row;
}

export function createProfessionalsAuthRepository(db: DbClient): ProfessionalsAuthRepository {
  return {
    async findByAuthUserId(authUserId, tx) {
      const executor: QueryExecutor = tx ?? db;
      const [professional] = await executor.select().from(professionals).where(eq(professionals.authUserId, authUserId));
      return professional ?? null;
    },

    findUnclaimedByEmail(email, tx) {
      const executor: QueryExecutor = tx ?? db;
      return executor
        .select()
        .from(professionals)
        .where(and(eq(professionals.email, email), isNull(professionals.authUserId)));
    },

    async linkAuthUser(professionalId, authUserId, actor, tx) {
      const executor: QueryExecutor = tx ?? db;
      const [updated] = await executor
        .update(professionals)
        .set({ authUserId })
        .where(eq(professionals.id, professionalId))
        .returning();
      const professional = assertRow(updated, "Update de vínculo de auth não retornou linha");

      await executor.insert(auditLog).values({
        clinicId: professional.clinicId,
        actorId: actor.type === "professional" ? (actor.professionalId ?? professional.id) : null,
        actorType: actor.type,
        action: "professional.auth_linked",
        entityType: "professional",
        entityId: professional.id,
        before: { authUserId: null },
        after: { authUserId },
      });

      return professional;
    },
  };
}
