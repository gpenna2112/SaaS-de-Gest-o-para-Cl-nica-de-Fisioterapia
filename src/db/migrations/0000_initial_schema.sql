-- Necessário para os índices GiST compostos (uuid + tstzrange) usados abaixo
-- em "sessions" — ver ADR-0002/ADR-0013/ADR-0015. Não cria exclusion
-- constraint; conflito de sala e de profissional são validados na aplicação
-- (transação SERIALIZABLE), estes índices só aceleram essas duas consultas.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"default_session_duration_minutes" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professionals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"auth_user_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professionals_clinic_email_unique" UNIQUE("clinic_id","email"),
	CONSTRAINT "professionals_role_check" CHECK ("professionals"."role" in ('fisioterapeuta','gestora'))
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_clinic_name_unique" UNIQUE("clinic_id","name"),
	CONSTRAINT "rooms_type_check" CHECK ("rooms"."type" in ('individual','pilates')),
	CONSTRAINT "rooms_capacity_check" CHECK ("rooms"."capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"primary_professional_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'ativa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_status_check" CHECK ("sessions"."status" in ('ativa','cancelada')),
	CONSTRAINT "sessions_time_range_check" CHECK ("sessions"."scheduled_end" > "sessions"."scheduled_start")
);
--> statement-breakpoint
CREATE TABLE "session_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"status" text DEFAULT 'agendada' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_attendees_session_patient_unique" UNIQUE("session_id","patient_id"),
	CONSTRAINT "session_attendees_status_check" CHECK ("session_attendees"."status" in ('agendada','confirmada','realizada','falta','cancelada'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"response" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_channel_check" CHECK ("notifications"."channel" in ('whatsapp_cloud_api','manual_fallback')),
	CONSTRAINT "notifications_status_check" CHECK ("notifications"."status" in ('pendente','enviada','entregue','falha','respondida')),
	CONSTRAINT "notifications_response_check" CHECK ("notifications"."response" is null or "notifications"."response" in ('confirmado','cancelado'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_type_check" CHECK ("audit_log"."actor_type" in ('professional','patient_reply','system'))
);
--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_primary_professional_id_professionals_id_fk" FOREIGN KEY ("primary_professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendees" ADD CONSTRAINT "session_attendees_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendees" ADD CONSTRAINT "session_attendees_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_attendees" ADD CONSTRAINT "session_attendees_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_professionals_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professionals_clinic_active_idx" ON "professionals" USING btree ("clinic_id","active");--> statement-breakpoint
CREATE INDEX "rooms_clinic_active_idx" ON "rooms" USING btree ("clinic_id","active");--> statement-breakpoint
CREATE INDEX "patients_clinic_professional_idx" ON "patients" USING btree ("clinic_id","primary_professional_id");--> statement-breakpoint
CREATE INDEX "patients_clinic_phone_idx" ON "patients" USING btree ("clinic_id","phone");--> statement-breakpoint
CREATE INDEX "sessions_clinic_professional_start_idx" ON "sessions" USING btree ("clinic_id","professional_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "sessions_clinic_status_idx" ON "sessions" USING btree ("clinic_id","status");--> statement-breakpoint
CREATE INDEX "session_attendees_clinic_session_idx" ON "session_attendees" USING btree ("clinic_id","session_id");--> statement-breakpoint
CREATE INDEX "session_attendees_clinic_patient_status_idx" ON "session_attendees" USING btree ("clinic_id","patient_id","status");--> statement-breakpoint
CREATE INDEX "notifications_clinic_session_idx" ON "notifications" USING btree ("clinic_id","session_id");--> statement-breakpoint
CREATE INDEX "notifications_clinic_status_scheduled_idx" ON "notifications" USING btree ("clinic_id","status","scheduled_for");--> statement-breakpoint
CREATE INDEX "notifications_clinic_patient_status_idx" ON "notifications" USING btree ("clinic_id","patient_id","status");--> statement-breakpoint
CREATE INDEX "audit_log_clinic_entity_idx" ON "audit_log" USING btree ("clinic_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_clinic_created_idx" ON "audit_log" USING btree ("clinic_id","created_at");--> statement-breakpoint
-- Suporte às duas consultas de conflito da aplicação (ADR-0013/0015): uma
-- session ativa por sala/horário, um profissional sem sessions ativas
-- sobrepostas. Parciais: sessions canceladas não bloqueiam nada.
CREATE INDEX "sessions_room_active_range_idx" ON "sessions" USING gist (
	"room_id",
	tstzrange("scheduled_start", "scheduled_end")
) WHERE "status" = 'ativa';
--> statement-breakpoint
CREATE INDEX "sessions_professional_active_range_idx" ON "sessions" USING gist (
	"professional_id",
	tstzrange("scheduled_start", "scheduled_end")
) WHERE "status" = 'ativa';