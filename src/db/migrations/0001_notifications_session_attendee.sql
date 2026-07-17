ALTER TABLE "notifications" DROP CONSTRAINT "notifications_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_patient_id_patients_id_fk";
--> statement-breakpoint
DROP INDEX "notifications_clinic_session_idx";
--> statement-breakpoint
DROP INDEX "notifications_clinic_patient_status_idx";
--> statement-breakpoint
-- Não há linhas em produção (nada foi lançado ainda) — NOT NULL direto,
-- sem passo intermediário de backfill.
ALTER TABLE "notifications" ADD COLUMN "session_attendee_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_session_attendee_id_session_attendees_id_fk" FOREIGN KEY ("session_attendee_id") REFERENCES "public"."session_attendees"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "session_id";
--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "patient_id";
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_attendee_template_unique" UNIQUE("session_attendee_id","template");
--> statement-breakpoint
CREATE INDEX "notifications_clinic_attendee_idx" ON "notifications" USING btree ("clinic_id","session_attendee_id");
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_status_check";
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_status_check" CHECK ("notifications"."status" in ('pendente','enviada','entregue','falha','respondida','cancelada'));
