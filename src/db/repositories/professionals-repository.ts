import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { writeAuditLog, type Actor } from "../audit-log";
import type { DbClient, QueryExecutor, Tx } from "../client";
import { professionals } from "../schema";
import { DuplicateProfessionalEmailError, ProfessionalRecordNotFoundError } from "./professionals-repository.errors";

const PROFESSIONALS_CLINIC_EMAIL_UNIQUE_CONSTRAINT = "professionals_clinic_email_unique";

/**
 * `assertEmailAvailable` faz um pré-check sob isolamento padrão
 * (READ COMMITTED), que não impede duas requisições concorrentes de
 * passarem no pré-check antes de qualquer commit. Este guard é o
 * backstop: converte a violação real de constraint do Postgres no mesmo
 * erro de domínio que o pré-check já lançaria, em vez de deixar o erro
 * cru do driver escapar para `error-response.ts`.
 */
function isUniqueViolation(error: unknown, constraintName: string): boolean {
  return error instanceof postgres.PostgresError && error.code === "23505" && error.constraint_name === constraintName;
}

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
      if (externalTx) {
        return updateProfessionalCore(externalTx, clinicId, professionalId, input, actor);
      }
      return db.transaction((tx) => updateProfessionalCore(tx, clinicId, professionalId, input, actor));
    },

    deactivateProfessional(professionalId, actor, externalTx) {
      if (externalTx) {
        return setActiveCore(externalTx, clinicId, professionalId, actor, false);
      }
      return db.transaction((tx) => setActiveCore(tx, clinicId, professionalId, actor, false));
    },

    reactivateProfessional(professionalId, actor, externalTx) {
      if (externalTx) {
        return setActiveCore(externalTx, clinicId, professionalId, actor, true);
      }
      return db.transaction((tx) => setActiveCore(tx, clinicId, professionalId, actor, true));
    },
  };
}
