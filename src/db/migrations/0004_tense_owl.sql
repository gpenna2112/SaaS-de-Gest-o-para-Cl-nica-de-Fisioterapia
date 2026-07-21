CREATE TABLE "evolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"session_attendee_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"professional_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evolutions_session_attendee_unique" UNIQUE("session_attendee_id")
);
--> statement-breakpoint
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_session_attendee_id_session_attendees_id_fk" FOREIGN KEY ("session_attendee_id") REFERENCES "public"."session_attendees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_professional_id_professionals_id_fk" FOREIGN KEY ("professional_id") REFERENCES "public"."professionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evolutions_clinic_patient_created_idx" ON "evolutions" USING btree ("clinic_id","patient_id","created_at");