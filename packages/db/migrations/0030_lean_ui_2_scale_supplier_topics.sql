CREATE TYPE "public"."context_origin" AS ENUM('internal', 'external');--> statement-breakpoint
ALTER TABLE "pestle_factor" ALTER COLUMN "dimension" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pestle_factor" ADD COLUMN "origin" "context_origin";--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "supplier_evidence" text;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "supplier_evidence_file_id" uuid;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "supplier_assessed_at" date;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "supplier_next_review_at" date;--> statement-breakpoint
ALTER TABLE "risk_matrix_config" ADD COLUMN "likelihood_descriptions" jsonb;--> statement-breakpoint
ALTER TABLE "risk_matrix_config" ADD COLUMN "impact_descriptions" jsonb;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_supplier_evidence_file_id_file_id_fk" FOREIGN KEY ("supplier_evidence_file_id") REFERENCES "public"."file"("id") ON DELETE set null ON UPDATE no action;