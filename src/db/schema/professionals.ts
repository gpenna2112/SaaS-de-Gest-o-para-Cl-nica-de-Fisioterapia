import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";

export const professionals = pgTable(
  "professionals",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    // Sem FK enforçada de propósito: as tabelas do Better Auth são criadas por
    // um sistema de migração separado (ver ADR-0006). Revisitar quando o
    // módulo auth for implementado.
    authUserId: text("auth_user_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("professionals_clinic_email_unique").on(table.clinicId, table.email),
    index("professionals_clinic_active_idx").on(table.clinicId, table.active),
    check("professionals_role_check", sql`${table.role} in ('fisioterapeuta','gestora')`),
  ],
);
