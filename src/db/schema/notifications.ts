import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { patients } from "./patients";
import { sessions } from "./sessions";

export const notifications = pgTable(
  "notifications",
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
    channel: text("channel").notNull(),
    template: text("template").notNull(),
    status: text("status").notNull().default("pendente"),
    response: text("response"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_clinic_session_idx").on(table.clinicId, table.sessionId),
    index("notifications_clinic_status_scheduled_idx").on(table.clinicId, table.status, table.scheduledFor),
    index("notifications_clinic_patient_status_idx").on(table.clinicId, table.patientId, table.status),
    check("notifications_channel_check", sql`${table.channel} in ('whatsapp_cloud_api','manual_fallback')`),
    check(
      "notifications_status_check",
      sql`${table.status} in ('pendente','enviada','entregue','falha','respondida')`,
    ),
    check(
      "notifications_response_check",
      sql`${table.response} is null or ${table.response} in ('confirmado','cancelado')`,
    ),
  ],
);
