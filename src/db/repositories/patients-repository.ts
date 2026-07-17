import { and, eq } from "drizzle-orm";
import { normalizePhone } from "@/modules/patients/phone";
import type { DbClient, QueryExecutor, Tx } from "../client";
import { auditLog, patients, professionals } from "../schema";
import {
  InvalidPhoneError,
  PatientNotFoundError,
  ProfessionalInactiveError,
  ProfessionalNotFoundError,
} from "./patients-repository.errors";

export type Patient = typeof patients.$inferSelect;

export interface Actor {
  type: "professional" | "patient_reply" | "system";
  professionalId?: string;
}

export interface CreatePatientInput {
  primaryProfessionalId: string;
  name: string;
  phone?: string | null;
}

export interface UpdatePatientInput {
  name?: string;
  phone?: string | null;
  primaryProfessionalId?: string;
}

export interface ListPatientsFilter {
  professionalId?: string;
  activeOnly?: boolean;
}

/**
 * Mutações aceitam uma `Tx` externa opcional (último parâmetro), mesmo
 * padrão de scheduling/notifications (ADR-0016) — permite composição
 * atômica futura sem que este repositório precise saber com quem.
 * Diferente de scheduling, nenhuma operação aqui precisa de `SERIALIZABLE`:
 * são inserts/updates simples, sem contagem entre linhas concorrentes —
 * uma transação (isolamento padrão) basta para atomicidade entre a escrita
 * em `patients` e o registro em `audit_log`.
 */
export interface PatientsRepository {
  createPatient(input: CreatePatientInput, actor: Actor, tx?: Tx): Promise<Patient>;
  getPatient(patientId: string, tx?: Tx): Promise<Patient | null>;
  listPatients(filter: ListPatientsFilter, tx?: Tx): Promise<Patient[]>;
  updatePatient(patientId: string, input: UpdatePatientInput, actor: Actor, tx?: Tx): Promise<Patient>;
  deactivatePatient(patientId: string, actor: Actor, tx?: Tx): Promise<Patient>;
}

function assertRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new Error(message);
  }
  return row;
}

function resolvePhone(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) {
    return null;
  }
  const normalized = normalizePhone(rawPhone);
  if (!normalized) {
    throw new InvalidPhoneError(rawPhone);
  }
  return normalized;
}

function patientAuditSnapshot(patient: Pick<Patient, "name" | "phone" | "primaryProfessionalId" | "active">) {
  return {
    name: patient.name,
    phone: patient.phone,
    primaryProfessionalId: patient.primaryProfessionalId,
    active: patient.active,
  };
}

async function fetchPatient(executor: QueryExecutor, clinicId: string, patientId: string) {
  const [patient] = await executor
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)));
  return patient;
}

async function fetchProfessional(executor: QueryExecutor, clinicId: string, professionalId: string) {
  const [professional] = await executor
    .select()
    .from(professionals)
    .where(and(eq(professionals.id, professionalId), eq(professionals.clinicId, clinicId)));
  return professional;
}

async function assertActiveProfessional(executor: QueryExecutor, clinicId: string, professionalId: string): Promise<void> {
  const professional = await fetchProfessional(executor, clinicId, professionalId);
  if (!professional) {
    throw new ProfessionalNotFoundError(professionalId);
  }
  if (!professional.active) {
    throw new ProfessionalInactiveError(professionalId);
  }
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
    entityType: "patient",
    entityId,
    before: before as object | null,
    after: after as object | null,
  });
}

async function createPatientCore(
  executor: QueryExecutor,
  clinicId: string,
  input: CreatePatientInput,
  actor: Actor,
): Promise<Patient> {
  await assertActiveProfessional(executor, clinicId, input.primaryProfessionalId);
  const phone = resolvePhone(input.phone);

  const [inserted] = await executor
    .insert(patients)
    .values({
      clinicId,
      primaryProfessionalId: input.primaryProfessionalId,
      name: input.name,
      phone,
    })
    .returning();
  const patient = assertRow(inserted, "Insert de paciente não retornou linha");

  await writeAuditLog(executor, clinicId, actor, "patient.created", patient.id, null, patientAuditSnapshot(patient));

  return patient;
}

async function updatePatientCore(
  executor: QueryExecutor,
  clinicId: string,
  patientId: string,
  input: UpdatePatientInput,
  actor: Actor,
): Promise<Patient> {
  const current = await fetchPatient(executor, clinicId, patientId);
  if (!current) {
    throw new PatientNotFoundError([patientId]);
  }

  if (input.primaryProfessionalId) {
    await assertActiveProfessional(executor, clinicId, input.primaryProfessionalId);
  }

  const phone = input.phone !== undefined ? resolvePhone(input.phone) : current.phone;

  const [updatedRow] = await executor
    .update(patients)
    .set({
      name: input.name ?? current.name,
      phone,
      primaryProfessionalId: input.primaryProfessionalId ?? current.primaryProfessionalId,
      updatedAt: new Date(),
    })
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
    .returning();
  const updated = assertRow(updatedRow, "Update de paciente não retornou linha");

  await writeAuditLog(
    executor,
    clinicId,
    actor,
    "patient.updated",
    updated.id,
    patientAuditSnapshot(current),
    patientAuditSnapshot(updated),
  );

  return updated;
}

async function deactivatePatientCore(
  executor: QueryExecutor,
  clinicId: string,
  patientId: string,
  actor: Actor,
): Promise<Patient> {
  const current = await fetchPatient(executor, clinicId, patientId);
  if (!current) {
    throw new PatientNotFoundError([patientId]);
  }
  // Idempotente: desativar quem já está inativo não é erro, não gera novo
  // registro de auditoria (evitaria ruído sem nenhuma mudança real).
  if (!current.active) {
    return current;
  }

  const [updatedRow] = await executor
    .update(patients)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
    .returning();
  const updated = assertRow(updatedRow, "Update de desativação não retornou linha");

  await writeAuditLog(
    executor,
    clinicId,
    actor,
    "patient.deactivated",
    updated.id,
    patientAuditSnapshot(current),
    patientAuditSnapshot(updated),
  );

  return updated;
}

export function createPatientsRepository(db: DbClient, clinicId: string): PatientsRepository {
  return {
    createPatient(input, actor, externalTx) {
      if (externalTx) {
        return createPatientCore(externalTx, clinicId, input, actor);
      }
      return db.transaction((tx) => createPatientCore(tx, clinicId, input, actor));
    },

    async getPatient(patientId, tx) {
      const patient = await fetchPatient(tx ?? db, clinicId, patientId);
      return patient ?? null;
    },

    listPatients(filter, tx) {
      const executor = tx ?? db;
      const conditions = [eq(patients.clinicId, clinicId)];
      if (filter.professionalId) {
        conditions.push(eq(patients.primaryProfessionalId, filter.professionalId));
      }
      if (filter.activeOnly) {
        conditions.push(eq(patients.active, true));
      }
      return executor
        .select()
        .from(patients)
        .where(and(...conditions));
    },

    updatePatient(patientId, input, actor, externalTx) {
      if (externalTx) {
        return updatePatientCore(externalTx, clinicId, patientId, input, actor);
      }
      return db.transaction((tx) => updatePatientCore(tx, clinicId, patientId, input, actor));
    },

    deactivatePatient(patientId, actor, externalTx) {
      if (externalTx) {
        return deactivatePatientCore(externalTx, clinicId, patientId, actor);
      }
      return db.transaction((tx) => deactivatePatientCore(tx, clinicId, patientId, actor));
    },
  };
}
