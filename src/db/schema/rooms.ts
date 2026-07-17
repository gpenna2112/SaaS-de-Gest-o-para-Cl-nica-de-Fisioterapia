import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    name: text("name").notNull(),
    // Informativo/relatório apenas (ex.: KPI de ocupação por espaço). Não
    // participa da validação de ocupação — ver `capacity` e ADR-0013.
    type: text("type").notNull(),
    capacity: integer("capacity").notNull().default(1),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rooms_clinic_name_unique").on(table.clinicId, table.name),
    index("rooms_clinic_active_idx").on(table.clinicId, table.active),
    check("rooms_type_check", sql`${table.type} in ('individual','pilates')`),
    check("rooms_capacity_check", sql`${table.capacity} >= 1`),
  ],
);
