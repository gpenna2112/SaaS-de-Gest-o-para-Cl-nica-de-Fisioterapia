import type { QueryExecutor } from "./client";
import { auditLog } from "./schema";

export interface Actor {
  type: "professional" | "patient_reply" | "system";
  professionalId?: string;
}

/**
 * Grava uma entrada em `audit_log` (ADR-0010). Compartilhado por todos os
 * repositórios de escrita — antes duplicado 5x, uma cópia por repositório.
 */
export async function writeAuditLog(
  executor: QueryExecutor,
  clinicId: string,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await executor.insert(auditLog).values({
    clinicId,
    actorId: actor.type === "professional" ? (actor.professionalId ?? null) : null,
    actorType: actor.type,
    action,
    entityType,
    entityId,
    before: before as object | null,
    after: after as object | null,
  });
}
