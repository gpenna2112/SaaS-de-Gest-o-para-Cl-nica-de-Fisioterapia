import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    // Sem FK enforçada para o `user` do Better Auth, de propósito — decisão
    // reconfirmada e detalhada no ADR-0017 (integridade real, migrações
    // independentes, e não acoplar nosso schema à forma interna de uma
    // tabela que não controlamos). Gatilho de revisão: versão do Better
    // Auth considerada estável, ou incidente real de referência órfã.
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
    // Uma identidade do Better Auth vincula no máximo um `professional`
    // (ADR-0017) — parcial porque `auth_user_id` é nullable (profissional
    // pré-provisionado sem conta ativada ainda).
    uniqueIndex("professionals_auth_user_id_unique")
      .on(table.authUserId)
      .where(sql`${table.authUserId} is not null`),
  ],
);
