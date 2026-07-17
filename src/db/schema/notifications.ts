import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { sessionAttendees } from "./session-attendees";

/**
 * Outbox de notificações (ADR-0009). Vinculada a `session_attendees`, não a
 * `sessions`+`patients` soltos (ADR-0016) — uma confirmação é sempre sobre
 * uma participação específica, e a FK única garante que o par sessão+
 * paciente referenciado existiu de fato.
 */
export const notifications = pgTable(
  "notifications",
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
    // Impede duas notificações do mesmo tipo para o mesmo participante —
    // reagendamento é UPDATE da linha existente, nunca outro INSERT.
    unique("notifications_attendee_template_unique").on(table.sessionAttendeeId, table.template),
    index("notifications_clinic_attendee_idx").on(table.clinicId, table.sessionAttendeeId),
    index("notifications_clinic_status_scheduled_idx").on(table.clinicId, table.status, table.scheduledFor),
    check("notifications_channel_check", sql`${table.channel} in ('whatsapp_cloud_api','manual_fallback')`),
    check(
      "notifications_status_check",
      sql`${table.status} in ('pendente','enviada','entregue','falha','respondida','cancelada')`,
    ),
    check(
      "notifications_response_check",
      sql`${table.response} is null or ${table.response} in ('confirmado','cancelado')`,
    ),
  ],
);
