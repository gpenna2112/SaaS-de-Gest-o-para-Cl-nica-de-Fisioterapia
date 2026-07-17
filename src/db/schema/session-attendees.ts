import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { patients } from "./patients";
import { sessions } from "./sessions";

/**
 * Quem participa de uma `session`. Status, presença, confirmação e (futura)
 * cobrança são individuais aqui — nunca em `sessions`. Um mesmo paciente não
 * pode aparecer duas vezes na mesma sessão (UNIQUE session_id+patient_id).
 */
export const sessionAttendees = pgTable(
  "session_attendees",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    status: text("status").notNull().default("agendada"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("session_attendees_session_patient_unique").on(table.sessionId, table.patientId),
    index("session_attendees_clinic_session_idx").on(table.clinicId, table.sessionId),
    index("session_attendees_clinic_patient_status_idx").on(table.clinicId, table.patientId, table.status),
    check(
      "session_attendees_status_check",
      sql`${table.status} in ('agendada','confirmada','realizada','falta','cancelada')`,
    ),
  ],
);
