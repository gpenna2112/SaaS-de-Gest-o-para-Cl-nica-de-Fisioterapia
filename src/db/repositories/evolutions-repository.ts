import { and, asc, eq } from "drizzle-orm";
import type { DbClient, QueryExecutor, Tx } from "../client";
import { auditLog, evolutions } from "../schema";
import {
  EvolutionAlreadyExistsError,
  EvolutionNotFoundError,
  NotEvolutionAuthorError,
} from "./evolutions-repository.errors";

export type Evolution = typeof evolutions.$inferSelect;

export interface Actor {
  type: "professional" | "patient_reply" | "system";
  professionalId?: string;
}

export interface CreateEvolutionInput {
  sessionAttendeeId: string;
  /** Resolvido pelo chamador (rota) a partir de `schedulingRepository.getAttendee`
   * — este repositório não conhece `session_attendees` (ADR-0016/0019). */
  patientId: string;
  content: string;
}

export interface UpdateEvolutionInput {
  content: string;
}

/**
 * Evolução clínica mínima (ADR-0019) — uma nota por atendimento, editável só
 * pelo autor, com trilha completa em `audit_log`. Validar que o attendee
 * existe e está `realizada` é responsabilidade de quem chama (a rota,
 * compondo com `schedulingRepository.getAttendee` — ver ADR-0019/0016).
 */
export interface EvolutionsRepository {
  createEvolution(input: CreateEvolutionInput, actor: Actor, tx?: Tx): Promise<Evolution>;
  updateEvolution(evolutionId: string, input: UpdateEvolutionInput, actor: Actor, tx?: Tx): Promise<Evolution>;
  getEvolution(evolutionId: string, tx?: Tx): Promise<Evolution | null>;
  getBySessionAttendee(sessionAttendeeId: string, tx?: Tx): Promise<Evolution | null>;
  /** Ordem cronológica ascendente (mais antiga primeiro) — histórico de leitura. */
  listByPatient(patientId: string, tx?: Tx): Promise<Evolution[]>;
}

function assertRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }
  return row;
}

function evolutionAuditSnapshot(evolution: Pick<Evolution, "content" | "professionalId">) {
  return { content: evolution.content, professionalId: evolution.professionalId };
}

function requireActingProfessionalId(actor: Actor): string {
  if (actor.type !== "professional" || !actor.professionalId) {
    throw new Error("Evolução clínica só pode ser registrada por um profissional autenticado.");
  }
  return actor.professionalId;
}

async function fetchEvolutionById(executor: QueryExecutor, clinicId: string, evolutionId: string) {
  const [evolution] = await executor
    .select()
    .from(evolutions)
    .where(and(eq(evolutions.id, evolutionId), eq(evolutions.clinicId, clinicId)));
  return evolution;
}

async function fetchEvolutionByAttendee(executor: QueryExecutor, clinicId: string, sessionAttendeeId: string) {
  const [evolution] = await executor
    .select()
    .from(evolutions)
    .where(and(eq(evolutions.sessionAttendeeId, sessionAttendeeId), eq(evolutions.clinicId, clinicId)));
  return evolution;
}

async function writeAuditLog(
  executor: QueryExecutor,
  clinicId: string,
  actor: Actor,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await executor.insert(auditLog).values({
    clinicId,
    actorId: actor.type === "professional" ? (actor.professionalId ?? null) : null,
    actorType: actor.type,
    action,
    entityType: "evolution",
    entityId,
    before: before as object | null,
    after: after as object | null,
  });
}

async function createEvolutionCore(
  executor: QueryExecutor,
  clinicId: string,
  input: CreateEvolutionInput,
  actor: Actor,
): Promise<Evolution> {
  const professionalId = requireActingProfessionalId(actor);

  const existing = await fetchEvolutionByAttendee(executor, clinicId, input.sessionAttendeeId);
  if (existing) {
    throw new EvolutionAlreadyExistsError(input.sessionAttendeeId);
  }

  const [inserted] = await executor
    .insert(evolutions)
    .values({
      clinicId,
      sessionAttendeeId: input.sessionAttendeeId,
      patientId: input.patientId,
      professionalId,
      content: input.content,
    })
    .returning();
  const evolution = assertRow(inserted, "Insert de evolução não retornou linha");

  await writeAuditLog(executor, clinicId, actor, "evolution.created", evolution.id, null, evolutionAuditSnapshot(evolution));

  return evolution;
}

async function updateEvolutionCore(
  executor: QueryExecutor,
  clinicId: string,
  evolutionId: string,
  input: UpdateEvolutionInput,
  actor: Actor,
): Promise<Evolution> {
  const professionalId = requireActingProfessionalId(actor);
  const current = await fetchEvolutionById(executor, clinicId, evolutionId);
  if (!current) {
    throw new EvolutionNotFoundError(evolutionId);
  }
  if (current.professionalId !== professionalId) {
    throw new NotEvolutionAuthorError(evolutionId);
  }

  const [updatedRow] = await executor
    .update(evolutions)
    .set({ content: input.content, updatedAt: new Date() })
    .where(and(eq(evolutions.id, evolutionId), eq(evolutions.clinicId, clinicId)))
    .returning();
  const updated = assertRow(updatedRow, "Update de evolução não retornou linha");

  await writeAuditLog(
    executor,
    clinicId,
    actor,
    "evolution.updated",
    updated.id,
    evolutionAuditSnapshot(current),
    evolutionAuditSnapshot(updated),
  );

  return updated;
}

export function createEvolutionsRepository(db: DbClient, clinicId: string): EvolutionsRepository {
  return {
    createEvolution(input, actor, externalTx) {
      if (externalTx) {
        return createEvolutionCore(externalTx, clinicId, input, actor);
      }
      return db.transaction((tx) => createEvolutionCore(tx, clinicId, input, actor));
    },

    updateEvolution(evolutionId, input, actor, externalTx) {
      if (externalTx) {
        return updateEvolutionCore(externalTx, clinicId, evolutionId, input, actor);
      }
      return db.transaction((tx) => updateEvolutionCore(tx, clinicId, evolutionId, input, actor));
    },

    async getEvolution(evolutionId, tx) {
      const evolution = await fetchEvolutionById(tx ?? db, clinicId, evolutionId);
      return evolution ?? null;
    },

    async getBySessionAttendee(sessionAttendeeId, tx) {
      const evolution = await fetchEvolutionByAttendee(tx ?? db, clinicId, sessionAttendeeId);
      return evolution ?? null;
    },

    listByPatient(patientId, tx) {
      const executor = tx ?? db;
      return executor
        .select()
        .from(evolutions)
        .where(and(eq(evolutions.clinicId, clinicId), eq(evolutions.patientId, patientId)))
        .orderBy(asc(evolutions.createdAt));
    },
  };
}
