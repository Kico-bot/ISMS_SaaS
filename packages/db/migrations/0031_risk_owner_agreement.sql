ALTER TABLE "risk" ADD COLUMN "owner_agreed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "risk" ADD COLUMN "owner_agreed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "risk" ADD COLUMN "owner_agreement_note" text;--> statement-breakpoint
ALTER TABLE "risk" ADD COLUMN "owner_agreement_file_id" uuid;--> statement-breakpoint
ALTER TABLE "risk" ADD COLUMN "owner_agreement_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_owner_agreed_by_user_id_user_id_fk" FOREIGN KEY ("owner_agreed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_owner_agreement_file_id_file_id_fk" FOREIGN KEY ("owner_agreement_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;