CREATE TABLE "isms_scope" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"statement" text NOT NULL,
	"interfaces" text,
	"exclusions" text,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "isms_scope" ADD CONSTRAINT "isms_scope_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "isms_scope" ADD CONSTRAINT "isms_scope_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "isms_scope" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "isms_scope"
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
