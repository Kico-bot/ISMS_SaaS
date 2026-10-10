CREATE TYPE "public"."ai_annex_iii_area" AS ENUM('biometrics', 'critical_infrastructure', 'education', 'employment', 'essential_services', 'law_enforcement', 'migration', 'justice_democracy');--> statement-breakpoint
CREATE TYPE "public"."ai_system_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."requirement_scope" AS ENUM('not_addressed', 'ai_any', 'ai_high_risk', 'ai_fria', 'ai_biometric', 'ai_deepfake');--> statement-breakpoint
ALTER TYPE "public"."reporting_regime" ADD VALUE 'ai_provider_notice';--> statement-breakpoint
ALTER TYPE "public"."reporting_regime" ADD VALUE 'ai_authority_report';--> statement-breakpoint
CREATE TABLE "ai_system" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref_no" text NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"provider_name" text,
	"supplier_asset_id" uuid,
	"owner_person_id" uuid,
	"oversight_person_id" uuid,
	"status" "ai_system_status" DEFAULT 'draft' NOT NULL,
	"prohibited_practices" text[] DEFAULT '{}'::text[] NOT NULL,
	"annex_iii_area" "ai_annex_iii_area",
	"annex_i_product" boolean DEFAULT false NOT NULL,
	"art6_exception" boolean DEFAULT false NOT NULL,
	"art6_justification" text,
	"emotion_or_biometric" boolean DEFAULT false NOT NULL,
	"deepfake_or_public_text" boolean DEFAULT false NOT NULL,
	"public_service" boolean DEFAULT false NOT NULL,
	"credit_or_insurance" boolean DEFAULT false NOT NULL,
	"risk_class" text GENERATED ALWAYS AS (CASE
        WHEN cardinality(prohibited_practices) > 0 THEN 'prohibited'
        WHEN (annex_iii_area IS NOT NULL AND NOT art6_exception) OR annex_i_product THEN 'high'
        WHEN emotion_or_biometric OR deepfake_or_public_text THEN 'limited'
        ELSE 'minimal' END) STORED,
	"fria_required" boolean GENERATED ALWAYS AS (cardinality(prohibited_practices) = 0
        AND annex_iii_area IS NOT NULL AND NOT art6_exception
        AND annex_iii_area <> 'critical_infrastructure'
        AND (public_service OR credit_or_insurance)) STORED,
	"instructions_received" boolean DEFAULT false NOT NULL,
	"log_retention_months" smallint,
	"workplace_use" boolean DEFAULT false NOT NULL,
	"workers_informed_at" date,
	"fria_completed_at" date,
	"personal_data" boolean DEFAULT false NOT NULL,
	"processing_activity_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_system_tenant_ref_uq" UNIQUE("tenant_id","ref_no"),
	CONSTRAINT "ai_system_retention_chk" CHECK ("ai_system"."log_retention_months" IS NULL OR "ai_system"."log_retention_months" >= 0)
);
--> statement-breakpoint
ALTER TABLE "requirement" ADD COLUMN "applies_to" "requirement_scope";--> statement-breakpoint
ALTER TABLE "requirement" ADD COLUMN "alt_ref" text;--> statement-breakpoint
ALTER TABLE "requirement" ADD COLUMN "applies_from" date;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "ai_system_id" uuid;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "ai_serious_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_system" ADD CONSTRAINT "ai_system_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_system" ADD CONSTRAINT "ai_system_supplier_asset_id_asset_id_fk" FOREIGN KEY ("supplier_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_system" ADD CONSTRAINT "ai_system_owner_person_id_person_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_system" ADD CONSTRAINT "ai_system_oversight_person_id_person_id_fk" FOREIGN KEY ("oversight_person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_system" ADD CONSTRAINT "ai_system_processing_activity_id_processing_activity_id_fk" FOREIGN KEY ("processing_activity_id") REFERENCES "public"."processing_activity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_system_tenant_status_idx" ON "ai_system" USING btree ("tenant_id","status");