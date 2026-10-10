CREATE TYPE "public"."protection_variant" AS ENUM('basis', 'standard', 'kern');--> statement-breakpoint
CREATE TABLE "tenant_module" (
	"tenant_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"elevated" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_module_tenant_id_requirement_id_pk" PRIMARY KEY("tenant_id","requirement_id")
);
--> statement-breakpoint
ALTER TABLE "tenant_framework" ADD COLUMN "protection_variant" "protection_variant";--> statement-breakpoint
ALTER TABLE "tenant_module" ADD CONSTRAINT "tenant_module_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_module" ADD CONSTRAINT "tenant_module_requirement_id_requirement_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirement"("id") ON DELETE cascade ON UPDATE no action;