import { and, eq } from "drizzle-orm";
import { writeAuditLog, type Actor } from "../audit-log";
import type { DbClient, QueryExecutor, Tx } from "../client";
import { isForeignKeyViolation, isUniqueViolation } from "../postgres-errors";
import { professionals } from "../schema";
import { withSerializableRetry } from "../transaction-retry";
import {
  DuplicateProfessionalEmailError,
  LastGestoraError,
  ProfessionalHasRelatedRecordsError,
  ProfessionalRecordNotFoundError,
  ProfessionalsWriteConflictError,
} from "./professionals-repository.errors";

const PROFESSIONALS_CLINIC_EMAIL_UNIQUE_CONSTRAINT = "professionals_clinic_email_unique";

export type { Actor };
export type Professional = typeof professionals.$inferSelect;
export type ProfessionalRole = "fisioterapeuta" | "gestora";

export interface ListProfessionalsFilter {
  activeOnly?: boolean;
}

export interface CreateProfessionalInput {
  name: string;
  email: string;
  role: ProfessionalRole;
}

export interface UpdateProfessionalInput {
  name?: string;
  email?: string;
  role?: ProfessionalRole;
}

/**
 * Tenant-scoped. Leitura já existia (ADR-0007); escrita adicionada para o
 * cadastro de equipe deixar de depender de SQL manual — mesmo padrão de
 * audit_log/idempotência de `patients-repository.ts`. `professionals` não
 * tem `updated_at` (só `created_at`), diferente de `patients`.
 */
export interface ProfessionalsRepository {
  listProfessionals(filter: ListProfessionalsFilter, tx?: Tx): Promise<Professional[]>;
  getProfessional(professionalId: string, tx?: Tx): Promise<Professional | null>;
  createProfessional(input: CreateProfessionalInput, actor: Actor, tx?: Tx): Promise<Professional>;
  updateProfessional(
    professionalId: string,
    input: UpdateProfessionalInput,
    actor: Actor,
    tx?: Tx,
  ): Promise<Professional>;
  deactivateProfessional(professionalId: string, actor: Actor, tx?: Tx): Promise<Professional>;
  reactivateProfessional(professionalId: string, actor: Actor, tx?: Tx): Promise<Professional>;
  deleteProfessional(professionalId: string, actor: Actor, tx?: Tx): Promise<void>;
}

function assertRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }
  return row;
}

function professionalAuditSnapshot(professional: Pick<Professional, "name" | "email" | "role" | "active">) {
  return {
    name: professional.name,
    email: professional.email,
    role: professional.role,
    active: professional.active,
  };
}

async function fetchProfessionalById(executor: QueryExecutor, clinicId: string, professionalId: string) {
  const [professional] = await executor
    .select()
    .from(professionals)
    .where(and(eq(professionals.id, professionalId), eq(professionals.clinicId, clinicId)));
  return professional;
}

async function assertEmailAvailable(
  executor: QueryExecutor,
  clinicId: string,
  email: string,
  excludeProfessionalId?: string,
): Promise<void> {
  const existing = await executor
    .select({ id: professionals.id })
    .from(professionals)
    .where(and(eq(professionals.clinicId, clinicId), eq(professionals.email, email)));
  const conflicting = existing.find((row) => row.id !== excludeProfessionalId);
  if (conflicting) {
    throw new DuplicateProfessionalEmailError(email);
  }
}

/**
 * Lê-para-validar-depois-escreve: sem constraint de banco equivalente para
 * servir de backstop (não há como expressar "pelo menos uma gestora ativa
 * por clínica" como constraint simples), a garantia real vem de rodar sob
 * `SERIALIZABLE` (ver `updateProfessional`/`deactivateProfessional` em
 * `createProfessionalsRepository`) — duas transações que leem este mesmo
 * conjunto e escrevem sobre linhas que o predicado da outra leu formam um
 * ciclo que o Postgres detecta via SSI e aborta uma delas com
 * `serialization_failure`, disparando o retry de `withSerializableRetry`.
 */
async function assertNotLastActiveGestora(
  executor: QueryExecutor,
  clinicId: string,
  professionalId: string,
): Promise<void> {
  const otherActiveGestoras = await executor
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.clinicId, clinicId),
        eq(professionals.role, "gestora"),
        eq(professionals.active, true),
      ),
    );
  const remaining = otherActiveGestoras.filter((row) => row.id !== professionalId);
  if (remaining.length === 0) {
    throw new LastGestoraError(professionalId);
  }
}

async function createProfessionalCore(
  executor: QueryExecutor,
  clinicId: string,
  input: CreateProfessionalInput,
  actor: Actor,
): Promise<Professional> {
  await assertEmailAvailable(executor, clinicId, input.email);

  let inserted;
  try {
    [inserted] = await executor
      .insert(professionals)
      .values({ clinicId, name: input.name, email: input.email, role: input.role })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error, PROFESSIONALS_CLINIC_EMAIL_UNIQUE_CONSTRAINT)) {
      throw new DuplicateProfessionalEmailError(input.email);
    }
    throw error;
  }
  const professional = assertRow(inserted, "Insert de profissional não retornou linha");

  await writeAuditLog(
    executor,
    clinicId,
    actor,
    "professional.created",
    "professional",
    professional.id,
    null,
    professionalAuditSnapshot(professional),
  );

  return professional;
}

async function updateProfessionalCore(
  executor: QueryExecutor,
  clinicId: string,
  professionalId: string,
  input: UpdateProfessionalInput,
  actor: Actor,
): Promise<Professional> {
  const current = await fetchProfessionalById(executor, clinicId, professionalId);
  if (!current) {
    throw new ProfessionalRecordNotFoundError(professionalId);
  }
  if (input.email && input.email !== current.email) {
    await assertEmailAvailable(executor, clinicId, input.email, professionalId);
  }
  if (current.active && current.role === "gestora" && input.role && input.role !== "gestora") {
    await assertNotLastActiveGestora(executor, clinicId, professionalId);
  }

  let updatedRow;
  try {
    [updatedRow] = await executor
      .update(professionals)
      .set({
        name: input.name ?? current.name,
        email: input.email ?? current.email,
        role: input.role ?? current.role,
      })
      .where(and(eq(professionals.id, professionalId), eq(professionals.clinicId, clinicId)))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error, PROFESSIONALS_CLINIC_EMAIL_UNIQUE_CONSTRAINT)) {
      throw new DuplicateProfessionalEmailError(input.email ?? current.email);
    }
    throw error;
  }
  const updated = assertRow(updatedRow, "Update de profissional não retornou linha");

  await writeAuditLog(
    executor,
    clinicId,
    actor,
    "professional.updated",
    "professional",
    updated.id,
    professionalAuditSnapshot(current),
    professionalAuditSnapshot(updated),
  );

  return updated;
}

async function setActiveCore(
  executor: QueryExecutor,
  clinicId: string,
  professionalId: string,
  actor: Actor,
  active: boolean,
): Promise<Professional> {
  const current = await fetchProfessionalById(executor, clinicId, professionalId);
  if (!current) {
    throw new ProfessionalRecordNotFoundError(professionalId);
  }
  // Idempotente, mesmo espírito de patients-repository.
  if (current.active === active) {
    return current;
  }
  if (!active && current.role === "gestora") {
    await assertNotLastActiveGestora(executor, clinicId, professionalId);
  }

  const [updatedRow] = await executor
    .update(professionals)
    .set({ active })
    .where(and(eq(professionals.id, professionalId), eq(professionals.clinicId, clinicId)))
    .returning();
  const updated = assertRow(updatedRow, "Update de ativação não retornou linha");

  await writeAuditLog(
    executor,
    clinicId,
    actor,
    active ? "professional.reactivated" : "professional.deactivated",
    "professional",
    updated.id,
    professionalAuditSnapshot(current),
    professionalAuditSnapshot(updated),
  );

  return updated;
}

async function deleteProfessionalCore(
  executor: QueryExecutor,
  clinicId: string,
  professionalId: string,
  actor: Actor,
): Promise<void> {
  const current = await fetchProfessionalById(executor, clinicId, professionalId);
  if (!current) {
    throw new ProfessionalRecordNotFoundError(professionalId);
  }

  try {
    await executor
      .delete(professionals)
      .where(and(eq(professionals.id, professionalId), eq(professionals.clinicId, clinicId)));
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new ProfessionalHasRelatedRecordsError(professionalId);
    }
    throw error;
  }

  await writeAuditLog(
    executor,
    clinicId,
    actor,
    "professional.deleted",
    "professional",
    professionalId,
    professionalAuditSnapshot(current),
    null,
  );
}

export function createProfessionalsRepository(db: DbClient, clinicId: string): ProfessionalsRepository {
  return {
    listProfessionals(filter, tx) {
      const executor = tx ?? db;
      const conditions = [eq(professionals.clinicId, clinicId)];
      if (filter.activeOnly) {
        conditions.push(eq(professionals.active, true));
      }
      return executor.select().from(professionals).where(and(...conditions));
    },

    async getProfessional(professionalId, tx) {
      const professional = await fetchProfessionalById(tx ?? db, clinicId, professionalId);
      return professional ?? null;
    },

    createProfessional(input, actor, externalTx) {
      if (externalTx) {
        return createProfessionalCore(externalTx, clinicId, input, actor);
      }
      return db.transaction((tx) => createProfessionalCore(tx, clinicId, input, actor));
    },

    updateProfessional(professionalId, input, actor, externalTx) {
      // Sem `Tx` externa: pode rebaixar a última gestora ativa (role
      // gestora -> fisioterapeuta), então roda sob SERIALIZABLE com retry —
      // ver `assertNotLastActiveGestora`. Com `Tx` externa, o chamador é
      // quem decide a política transacional do conjunto (ver README).
      if (externalTx) {
        return updateProfessionalCore(externalTx, clinicId, professionalId, input, actor);
      }
      return withSerializableRetry(
        () =>
          db.transaction((tx) => updateProfessionalCore(tx, clinicId, professionalId, input, actor), {
            isolationLevel: "serializable",
          }),
        (lastError) => new ProfessionalsWriteConflictError(lastError),
      );
    },

    deactivateProfessional(professionalId, actor, externalTx) {
      // Mesmo racional de `updateProfessional`: desativar pode ser a
      // última gestora ativa, então roda sob SERIALIZABLE com retry.
      if (externalTx) {
        return setActiveCore(externalTx, clinicId, professionalId, actor, false);
      }
      return withSerializableRetry(
        () =>
          db.transaction((tx) => setActiveCore(tx, clinicId, professionalId, actor, false), {
            isolationLevel: "serializable",
          }),
        (lastError) => new ProfessionalsWriteConflictError(lastError),
      );
    },

    reactivateProfessional(professionalId, actor, externalTx) {
      if (externalTx) {
        return setActiveCore(externalTx, clinicId, professionalId, actor, true);
      }
      return db.transaction((tx) => setActiveCore(tx, clinicId, professionalId, actor, true));
    },

    deleteProfessional(professionalId, actor, externalTx) {
      if (externalTx) {
        return deleteProfessionalCore(externalTx, clinicId, professionalId, actor);
      }
      return db.transaction((tx) => deleteProfessionalCore(tx, clinicId, professionalId, actor));
    },
  };
}
