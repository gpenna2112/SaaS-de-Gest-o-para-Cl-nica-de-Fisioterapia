import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { professionals } from "./professionals";

export const patients = pgTable(
  "patients",
  {
    // Público (ADR-0004): referenciável por sistemas externos (app de pés).
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    primaryProfessionalId: uuid("primary_professional_id")
      .notNull()
      .references(() => professionals.id),
    name: text("name").notNull(),
    // Nullable: nem todo cadastro tem WhatsApp no momento da criação; ausência
    // apenas impede o disparo automático de confirmação (F2), não é erro.
    phone: text("phone"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("patients_clinic_professional_idx").on(table.clinicId, table.primaryProfessionalId),
    index("patients_clinic_phone_idx").on(table.clinicId, table.phone),
  ],
);
