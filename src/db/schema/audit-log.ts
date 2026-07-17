import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { professionals } from "./professionals";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    // Nullable: ações sem profissional humano (ex.: resposta do paciente via
    // WhatsApp, job automático) — ver actorType.
    actorId: uuid("actor_id").references(() => professionals.id),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_clinic_entity_idx").on(table.clinicId, table.entityType, table.entityId),
    index("audit_log_clinic_created_idx").on(table.clinicId, table.createdAt),
    check("audit_log_actor_type_check", sql`${table.actorType} in ('professional','patient_reply','system')`),
  ],
);
