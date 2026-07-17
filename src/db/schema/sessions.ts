import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics";
import { professionals } from "./professionals";
import { rooms } from "./rooms";

/**
 * Uma `session` é a turma/vaga (sala + horário + UM fisioterapeuta
 * responsável) — nunca um paciente. Quem participa vive em
 * `session_attendees` (1..N pacientes, até `rooms.capacity`).
 *
 * `status` aqui é só `ativa`/`cancelada` — o ciclo completo
 * (agendada/confirmada/realizada/falta) é por participante, não da turma.
 * Uma session vira `cancelada` automaticamente quando o último attendee
 * ativo é cancelado (ver scheduling-repository.ts) — ela deixa de bloquear
 * a sala/horário.
 *
 * Conflito de sala e de profissional são validados na aplicação (transação
 * SERIALIZABLE, não EXCLUDE constraint) — ver ADR-0013/0014/0015. Os índices
 * GiST parciais abaixo (WHERE status = 'ativa') são adicionados via SQL
 * manual na migration, dando suporte a essas duas consultas de sobreposição.
 */
export const sessions = pgTable(
  "sessions",
  {
    // Público (ADR-0004).
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("ativa"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_clinic_professional_start_idx").on(table.clinicId, table.professionalId, table.scheduledStart),
    index("sessions_clinic_status_idx").on(table.clinicId, table.status),
    check("sessions_status_check", sql`${table.status} in ('ativa','cancelada')`),
    check("sessions_time_range_check", sql`${table.scheduledEnd} > ${table.scheduledStart}`),
  ],
);
