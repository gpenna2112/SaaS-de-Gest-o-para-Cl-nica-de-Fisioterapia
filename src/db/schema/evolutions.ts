import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { patients } from "./patients";
import { professionals } from "./professionals";
import { sessionAttendees } from "./session-attendees";

/**
 * Evolução clínica mínima (ADR-0019, antecipada da fase 3 do PRD): uma nota
 * de texto livre por atendimento (`session_attendee`) realizado, com autor
 * e trilha de auditoria em `audit_log` — não uma máquina de estados
 * rascunho/revisado/finalizado (isso é a fase 3 completa). `patientId` é
 * desnormalizado a partir de `session_attendees.patient_id` de propósito:
 * a consulta cronológica por paciente (histórico) não deveria depender de
 * um join até `session_attendees`/`sessions` toda vez.
 */
export const evolutions = pgTable(
  "evolutions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    sessionAttendeeId: uuid("session_attendee_id")
      .notNull()
      .references(() => sessionAttendees.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Uma evolução por atendimento — não por sessão (ver ADR-0019 §1).
    unique("evolutions_session_attendee_unique").on(table.sessionAttendeeId),
    index("evolutions_clinic_patient_created_idx").on(table.clinicId, table.patientId, table.createdAt),
  ],
);
